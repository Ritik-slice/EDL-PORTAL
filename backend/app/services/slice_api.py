"""
Slice UAT API Client
Fetches applicant data from Slice's Bellman/BankOS APIs.
All endpoints configurable via environment variables.
"""
from __future__ import annotations

from typing import Optional
import httpx
from loguru import logger

from app.core.config import settings


class SliceAPIClient:
    """Client for Slice's underwriting APIs."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        access_token: Optional[str] = None,
    ):
        self.base_url = (base_url or settings.SLICE_API_BASE_URL).rstrip("/")
        self.access_token = access_token or settings.SLICE_ACCESS_TOKEN
        self.headers = {
            "a-access-token": self.access_token,
            "accept": "application/json",
            "bellman-version": "v2",
        }
        self.timeout = 30.0

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def _get(self, path: str) -> dict:
        """Make a GET request to Slice API."""
        url = self._url(path)
        logger.info(f"Slice API GET: {url}")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code == 401:
                raise SliceAuthError("Slice API authentication failed. Check SLICE_ACCESS_TOKEN.")
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "error":
                raise SliceAPIError(data.get("msg", "Unknown error"))
            return data

    async def _post(self, path: str, json_body: dict) -> dict:
        """Make a POST request to Slice API."""
        url = self._url(path)
        logger.info(f"Slice API POST: {url}")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers={**self.headers, "Content-Type": "application/json"}, json=json_body)
            if resp.status_code == 401:
                raise SliceAuthError("Slice API authentication failed.")
            resp.raise_for_status()
            return resp.json()

    # ── Business Details ────────────────────────────────────────────────────

    async def get_business_details(self, app_id: str) -> dict:
        """
        GET /api/underwriting/v1/applicant/{app_id}/business-details
        Returns: business name, constitution, address, PAN, GSTIN, udyam, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/business-details"
        )

    # ── Account Aggregator Processed Data ────────────────────────────────────

    async def get_account_aggregator_data(self, app_id: str) -> dict:
        """
        GET /api/underwriting/crm/v1/bank-statement/account-aggregator/processed-data/{app_id}
        Returns: bank statement analysis, monthly summaries, cash flow, BTO, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/crm/v1/bank-statement/account-aggregator/processed-data/{app_id}"
        )

    # ── Eligibility Details ──────────────────────────────────────────────────

    async def get_eligibility_details(self, app_id: str) -> dict:
        """
        GET /api/underwriting/v1/applicant/{app_id}/eligibility-details
        Returns: loan eligibility per program, FOIR, ABB/EMI, recommended amount, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/eligibility-details"
        )

    # ── Application Details ──────────────────────────────────────────────────

    async def get_application_details(self, app_id: str) -> dict:
        """
        GET /api/underwriting/v1/applicant/{app_id}/application-details
        Returns: applicant info, co-applicants, loan details, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/application-details"
        )

    # ── Bureau Details ───────────────────────────────────────────────────────

    async def get_bureau_details(self, app_id: str) -> dict:
        """
        GET /api/underwriting/v1/applicant/{app_id}/bureau-details
        Returns: bureau scores, tradelines, DPD history, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/bureau-details"
        )

    # ── GST Details ──────────────────────────────────────────────────────────

    async def get_gst_details(self, app_id: str) -> dict:
        """
        GET /api/underwriting/v1/applicant/{app_id}/gst-details
        Returns: GSTIN, filing status, monthly turnover, etc.
        """
        return await self._get(
            f"/banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/gst-details"
        )

    # ── VKYC Generate Link ───────────────────────────────────────────────────

    async def generate_vkyc_link(
        self,
        uuid: str,
        mobile: str,
        name: str,
        vkyc_type: str = "business_kyc",
        vendor: str = "upswing",
        flow: str = "los_onboarding",
    ) -> dict:
        """
        POST /banking/kyc-gipl/vkyc/v2/generate-link
        Returns: VKYC link for the applicant.
        """
        # VKYC uses production base URL
        vkyc_url = settings.SLICE_VKYC_BASE_URL or self.base_url.replace("uat-", "")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{vkyc_url}/banking/kyc-gipl/vkyc/v2/generate-link",
                headers={"Content-Type": "application/json"},
                json={
                    "uuid": uuid,
                    "mobile": mobile,
                    "name": name,
                    "vendor": vendor,
                    "vkycType": vkyc_type,
                    "requestId": f"cam-{uuid[:8]}",
                    "flow": flow,
                },
            )
            resp.raise_for_status()
            return resp.json()

    # ── Fetch All Data for an Application ────────────────────────────────────

    async def fetch_all(self, app_id: str) -> dict:
        """
        Fetch all available data for an application in parallel.
        Returns a combined dict with all data sources.
        """
        import asyncio

        results = {}
        errors = []

        async def _safe_fetch(key: str, coro):
            try:
                results[key] = await coro
            except Exception as e:
                logger.warning(f"Slice API {key} failed for {app_id}: {e}")
                errors.append({"source": key, "error": str(e)})
                results[key] = None

        await asyncio.gather(
            _safe_fetch("business_details", self.get_business_details(app_id)),
            _safe_fetch("account_aggregator", self.get_account_aggregator_data(app_id)),
            _safe_fetch("eligibility", self.get_eligibility_details(app_id)),
            _safe_fetch("application", self.get_application_details(app_id)),
            _safe_fetch("bureau", self.get_bureau_details(app_id)),
            _safe_fetch("gst", self.get_gst_details(app_id)),
        )

        results["_errors"] = errors
        results["_app_id"] = app_id
        return results


class SliceAuthError(Exception):
    pass


class SliceAPIError(Exception):
    pass
