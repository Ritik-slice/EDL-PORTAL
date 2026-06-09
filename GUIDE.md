# EDL - SLICE CAM Automation Platform — Complete Guide

**GitHub Repo:** https://github.com/Ritik-slice/EDL-PORTAL
**Tech Stack:** FastAPI (Python) + React (TypeScript) + PostgreSQL + Tailwind CSS
**Runs on:** Rancher Desktop (Docker Compose)
**Total Code:** ~5,971 lines backend, ~2,793 lines frontend

---

## What We Built

A web platform that **replaces the existing CAM Excel workflow**. Instead of manually filling a .xlsm spreadsheet, underwriters use this portal where:

1. **Grey fields (auto-populated)** come pre-filled from Slice's backend APIs
2. **Yellow fields (editable)** are filled by the agent — either by uploading documents (which get auto-parsed) or by manual entry
3. The CAM is displayed as a web UI with **22 tabs matching every sheet** in the Excel CAM

---

## What's Currently Working

### Frontend (React + TypeScript + Tailwind)

| File | Purpose |
|---|---|
| `pages/Dashboard.tsx` | Lists all 11 EDL applications with bureau score, grade, sanctioned amount |
| `pages/CAMDetail.tsx` (1,304 lines) | **The main CAM view** — 22 tabs matching every Excel sheet |
| `pages/Login.tsx` | Auth with JWT |
| `pages/CaseDetail.tsx` | Auto-redirects to CAM detail |
| `components/cam/EditableField.tsx` | Yellow-highlighted inline-editable field component |
| `components/cam/DataTable.tsx` | Generic data table with editable cells |
| `components/cam/MetricCard.tsx` | Metric display card |
| `store/auth.ts` | Zustand auth store |
| `utils/api.ts` | Axios instance pointing to `http://localhost:8000/api/v1` |

**22 CAM Tabs:**
Overview, Demographic, Bureau & Credit, Banking, Additional Credit Checks, GST, ITR, Company Financials, Income (AIP), PD Notes, Reference Checks, Loan Purpose, Stock Details, Plant & Machinery, Property Details, Scorecard, Deviations, Interest Rate, Eligibility, Sanction Conditions, PSL & Charges, Disbursement

**Key UI feature:** Every tab has a `RawGridTable` component that can render the raw Excel grid with yellow (editable) and grey (read-only) cells highlighted.

### Backend (FastAPI + Python)

| File | Purpose |
|---|---|
| **Routes** | |
| `routes/auth.py` | Register + Login (JWT) |
| `routes/cases.py` | CRUD for loan cases |
| `routes/documents.py` | Document upload + parse → merge into CAM |
| `routes/cam_xlsm.py` | CAM XLSM upload + data retrieval + field editing |
| `routes/cam.py` | AI-powered CAM generation (Claude) |
| `routes/slice_fetch.py` | Fetch from Slice APIs by app_id |
| **Parsers** | |
| `parsers/cam_xlsm_parser.py` (1,313 lines) | **Core parser** — extracts ALL 25 Excel sheets with yellow/grey detection |
| `parsers/bank_statement_parser.py` | Parses bank statement PDF/Excel/CSV |
| `parsers/gst_parser.py` | Parses GST return JSON/PDF |
| `parsers/financial_statement_parser.py` | Parses P&L + Balance Sheet |
| `parsers/bureau_parser.py` | Parses CIBIL/Experian/Equifax PDF |
| **Services** | |
| `slice_api.py` | Slice UAT API client (7 endpoints wired) |
| `validators/cross_validator.py` | Cross-validates data across sources |
| `generators/cam_generator.py` | Uses Claude AI to write CAM commentary |
| **Models** | |
| `models/case.py` | Case (borrower, loan, status, risk_signals) |
| `models/document.py` | Document (type, parse_status, extracted_data as JSON) |
| `models/user.py` | User with roles |
| `seed_data.py` | Loads all 11 CAM files from `/data` folder |

### API Endpoints

```
POST   /api/v1/auth/register          — Register user
POST   /api/v1/auth/login             — Login → JWT token

POST   /api/v1/cases                  — Create case
GET    /api/v1/cases                  — List all cases
GET    /api/v1/cases/{id}             — Get case detail

POST   /api/v1/cases/{id}/documents   — Upload document → auto-parse → merge into CAM
GET    /api/v1/cases/{id}/documents   — List documents

GET    /api/v1/cases/{id}/cam-data    — Get full parsed CAM data (all 25 sheets)
PATCH  /api/v1/cases/{id}/cam-data    — Edit yellow fields (with audit trail)
GET    /api/v1/cases/{id}/cam-data/editable — List editable fields
GET    /api/v1/cases/{id}/cam-data/history  — Edit audit trail

POST   /api/v1/cases/{id}/upload-cam  — Upload .xlsm CAM file
POST   /api/v1/cases/{id}/cam         — Generate AI CAM report

POST   /api/v1/slice/fetch            — Fetch data from Slice APIs by app_id
POST   /api/v1/slice/vkyc             — Generate VKYC link
GET    /api/v1/slice/config           — Check Slice API config
```

---

## CAM Data Structure

This is the JSON structure returned by `GET /api/v1/cases/{id}/cam-data`. The frontend renders this directly. Any backend that returns this same structure will work with the frontend.

```json
{
  "application": {
    "applicant_name": "Aatowar Rahman",
    "business_name": "ARIFA STORE",
    "pan": "DDRPR0760M",
    "gstin": "...",
    "loan_amount": 500000,
    "loan_type": "EDL_STOCK",
    "app_id": "app_7gFZTEZn4SnrGR",
    "branch": "BOKO",
    "mobile": "6001242482",
    "email": "...",
    "dob": "1980-01-10",
    "age": 45,
    "constitution": "Proprietary",
    "nature_of_business": "TRADING",
    "business_type": "4721 - Retail sale of food...",
    "udyam_number": "UDYAM-AS-16-0031935",
    "primary_security": "STOCK",
    "secondary_security": null
  },

  "output": {
    "requested_loan_amount": 500000,
    "requested_loan_type": "EDL_STOCK",
    "Nature_of_business": "TRADING",
    "business_type": "4721 - Retail sale of food...",
    "business_constitution": "Proprietary",
    "co-applicant_relationship": "Ambiya begum-SPOUSE",
    "Total_existing_EMI_of_All_loans": 52230,
    "total_obligated_EMI": 30906,
    "number_of_bank_accounts": 2,
    "combined_average_bank_balance": 119561.43,
    "combined_bto": 3100808.16,
    "Annual_gst_turnover": null,
    "GST_status": null,
    "gst_filing_frequency": null,
    "Eligibility_as_per_Bank_Account": 1500000,
    "Eligibility_as_per_GST_Return": 0,
    "Eligibility_as_per_ITR": 0,
    "Eligibility_as_per_Income_Assessment": 0,
    "Maximum_Eligibility_as_per_FOIR": 1500000,
    "Eligibility_as_per_Security": 0,
    "Recommended_Loan_Amount_as_per_Underwriter": 0,
    "Final_Sanctioned_Amount": 345000,
    "Final_Tenure": 60,
    "Final_Interest_Rate": 0.2094,
    "Final_Proposed_Loan": 9257,
    "Final_FOIR": 0.5998,
    "Final_ABB/EMI_ratio": 2.97,
    "Income_Program_for_Eligbility": "Banking Program",
    "total_score_obtained": 80,
    "score_risk_band": "Medium Risk – M1",
    "Stock_security_amount_total": 473420,
    "Processing_Fee": "N/A",
    "Stamp_Duty": 200,
    "CGTMSE_Charge": 4063.05,
    "Cersai_Charge": 118,
    "Life_Insurance": 5985.78
  },

  "demographic": {
    "Sourcing Details": { "Branch Name": "BOKO", "State Name": "Assam" },
    "Loan Application Details": { "Application number": "app_...", "Collateral Type": "STOCK", "Requested Loan Type": "EDL_STOCK", "Requested Loan Amount": 500000 },
    "Business": { "Business Name": "ARIFA STORE", "Constitution": "Proprietary", "PAN No": "...", "GST No": "...", "Udyam No": "...", "Business Premise Ownership": "OWNED", "Nature of Business": "TRADING", "Business Type": "4721 - ..." },
    "Co-Borrower": { "Co-Borrower Name": "Aatowar Rahman", "Mobile/Phone No": 6001242482, "Email ID": "...", "PAN No": "...", "Date of Birth": "1980-01-10", "Age (years)": 45, "Father's Name": "Jaher Ali", "Occupation": "SELF_EMPLOYED" },
    "Co-Applicant Details": { "Co-Applicant 1 Name": "Ambiya begum", "Relation to applicant": "SPOUSE", "PAN No": "...", "Age (years)": 60 },
    "_raw_grid": { "headers": [...], "rows": [{ "cells": [{ "value": "...", "editable": false, "col": "B", "row": 3 }] }] }
  },

  "bureau": {
    "scores": [
      { "applicant_index": "0", "type": "Co Borrower", "name": "Aatowar Rahman", "provider": "crif - soft", "score": 757, "fetch_date": "2026-04-22", "ntc_flag": false },
      { "applicant_index": "1", "type": "Co-applicant 1", "name": "Ambiya begum", "provider": "cibil - hard", "score": 760, "fetch_date": "2026-04-22", "ntc_flag": false }
    ],
    "existing_loans": [
      { "borrower": "Co Borrower", "financier": "AXIS BANK", "loan_type": "Housing Loan", "amount": 2274444, "pos": 1794750, "term": 217, "mob": 61, "emi_assessed": 10984, "obligated": true }
    ],
    "commercial_bureau": { "name": "Commercial Bureau", "score": "NA", "date": "2026-04-22" },
    "_raw_grid": { ... }
  },

  "banking": { "_raw_grid": { "headers": [...], "rows": [...] } },

  "additional_credit_checks": { "RFA Check": "Not applicable", "Dedupe": "Not applicable", "_raw_grid": { ... } },

  "gst": {
    "auto_pull": { ... },
    "manual_pull": { "gstin": "24CLKPB2341C1ZT", "status": "Active", "latest_month": "Dec - 2025-26", "frequency": "Monthly" },
    "monthly_filings": [
      { "month": "Jan", "fy": "2024-25", "amount": 249464.8, "source": "manual", "editable": true }
    ],
    "_raw_grid": { ... }
  },

  "itr": { ... },

  "company_financials": {
    "balance_sheet": { ... },
    "pnl": { ... },
    "_raw_grid": { ... }
  },

  "aip": {
    "primary_income": { "No. of days for which Bills are collected": 90, "Daily Sales (INR)": 230982.77 },
    "bills": [...],
    "secondary_income": [...],
    "_raw_grid": { ... }
  },

  "pd_notes": {
    "Residence Premise Ownership": "Owned - Parental",
    "Business Vintage (in years)": 2,
    "Business Premise Ownership": "Rented",
    "Applicant's Academic Qualification": "HSLC/Matric",
    "Notes on Borrower Profile": "Applicant is engaged in the trading of...",
    "_raw_grid": { ... }
  },

  "reference_checks": { "items": [{ "name": "...", "relation": "CUSTOMER", "phone": "...", "feedback": "..." }] },

  "loan_purpose": { "items": [{ "sl_no": 1, "end_use": "Stock Procurement", "details": "...", "amount": 2500000 }] },

  "stock_details": {
    "items": [
      { "sl_no": 1, "description": "Mustard Oil", "quantity": 1, "rate": 40000, "amount": 40000 },
      { "sl_no": 2, "description": "Biscuit", "quantity": 1, "rate": 25000, "amount": 25000 }
    ],
    "total": 473420,
    "_raw_grid": { ... }
  },

  "plant_machinery_details": { "movable_pm": [...], "vehicles": [...], "_raw_grid": { ... } },

  "property_details": { "_raw_grid": { ... } },

  "scorecard": {
    "total_score": 80,
    "risk_band": "Medium Risk – M1",
    "parameters": [
      { "sr_no": "1", "parameter": "Social Status/Local Reputation", "max_score": 3, "criteria": "Good", "score": 2 },
      { "sr_no": "2", "parameter": "Age", "max_score": 5, "criteria": "25 to 49", "score": 5 }
    ],
    "_raw_grid": { ... }
  },

  "deviations_credit": {
    "items": [
      { "deviation": "TU score > 680 and <730", "description": "...", "mitigants": "...", "approving_authority": "ZCM", "approval_status": "Approved", "approved_by": "Name", "date": "2026-04-22" }
    ],
    "_raw_grid": { ... }
  },

  "interest_rate_calculator": {
    "Security Type": "Inventory",
    "Loan Amount Band": "C.10L_20L",
    "Geography": "All_of_India",
    "Bureau Score Band": "<780 or NTC",
    "Credit Assessment Program": "Banking Program",
    "No. of Credit Deviation": "<=2",
    "Final Rate": 0.2094,
    "_raw_grid": { ... }
  },

  "eligibility_inventory": { "_raw_grid": { "headers": [...], "rows": [...] } },
  "eligibility_property": { "_raw_grid": { "headers": [...], "rows": [...] } },

  "sanction_conditions": { "items": ["Condition 1...", "Condition 2..."], "_raw_grid": { ... } },

  "psl": { "PSL_Type": "MSME", "PSL_Category": "...", "_raw_grid": { ... } },

  "cgtmse_calculator": { ... },
  "charges": { "Processing Fee": "N/A", "Stamp Duty": 200, ... },
  "disbursement": { ... },
  "additional_information": { ... },

  "editable_fields": [
    { "sheet": "Bureau", "cell": "J19", "key": "emi_assessed_r19", "current_value": 1634 },
    { "sheet": "GST", "cell": "I3", "key": "gst_gstin", "current_value": "24CLKPB2341C1ZT" },
    { "sheet": "PD notes", "cell": "D2", "key": "Residence Premise Ownership", "current_value": "Owned - Parental" },
    { "sheet": "Stock Details", "cell": "B3", "key": "stock_r3", "current_value": "Mustard Oil" }
  ]
}
```

**Every sheet also has a `_raw_grid`** field containing:
```json
{
  "headers": ["Col A header", "Col B header", ...],
  "rows": [
    {
      "cells": [
        { "value": "Branch Name", "editable": false, "col": "B", "row": 3 },
        { "value": "BOKO", "editable": false, "col": "C", "row": 3 },
        { "value": "State Name", "editable": false, "col": "D", "row": 3 },
        { "value": "Assam", "editable": true, "col": "E", "row": 3 }
      ]
    }
  ]
}
```

This allows the frontend to render any sheet as an exact grid with yellow/grey cell highlighting.

---

## What Needs to Be Done Next (Backend Integration)

Your team member's backend code needs to replace/connect these pieces:

### 1. Slice API Integration
The routes in `slice_fetch.py` and `slice_api.py` are wired but need a valid `a-access-token`. The endpoints to connect:

```
GET  /banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/business-details
GET  /banking/bellman/bankos-svc/api/underwriting/crm/v1/bank-statement/account-aggregator/processed-data/{app_id}
GET  /banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/eligibility-details
GET  /banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/application-details
GET  /banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/bureau-details
GET  /banking/bellman/bankos-svc/api/underwriting/v1/applicant/{app_id}/gst-details
POST /banking/kyc-gipl/vkyc/v2/generate-link
```

These should populate the **grey (auto-populated)** fields in the CAM.

### 2. Document Parsing → CAM Field Mapping
When documents are uploaded via `POST /cases/{id}/documents`, the `_merge_into_cam()` function in `documents.py` maps parsed data into CAM fields. This mapping needs to be extended for your team's backend parsers. Current mappings:

| Document Type | CAM Fields Updated |
|---|---|
| Bank Statement | `combined_bto`, `combined_average_bank_balance`, EMI obligations, bounces |
| GST Return | `gstin`, `status`, `frequency`, monthly filings, `Annual_gst_turnover` |
| Financial Statement | Turnover, profit, assets, liabilities, capital (prev/curr year) |
| Bureau Report | Scores, tradelines, existing loans, total EMI |
| ITR | Business income |

### 3. Field Editing
The `PATCH /cam-data` endpoint allows editing yellow fields with audit trail. Uses dot-notation paths: `"output.Final_Sanctioned_Amount": 1500000` or `"pd_notes.Business Vintage (in years)": 3`. Every edit is logged with `updated_by`, `updated_at`, `old_value`, `new_value`.

### 4. The Frontend Contract
**The frontend reads everything from `GET /cam-data`**. Whatever JSON structure the backend returns at this endpoint, the frontend will render it. The key requirement is:
- Top-level keys matching sheet names in snake_case
- Each sheet having either structured data OR a `_raw_grid` (or both)
- `editable_fields` array tracking which cells are editable
- `output` dict with the 160 key-value pairs

---

## How to Run

```bash
# Start all services (Rancher Desktop)
cd /Users/ritiksiklighar/cam-platform
~/.rd/bin/docker compose up -d

# Load 11 test CAMs into database
~/.rd/bin/docker compose exec backend python3 seed_data.py

# Access
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
# Login:    agent@slice.in / slice2024
```

### Environment Variables (backend/.env)

```
DATABASE_URL=postgresql+asyncpg://cam_user:cam_pass@postgres:5432/cam_platform
REDIS_URL=redis://redis:6379/0
SECRET_KEY=your-secret-key
SLICE_API_BASE_URL=https://api.uat-nebank.com
SLICE_ACCESS_TOKEN=                              # Paste fresh token here
SLICE_VKYC_BASE_URL=https://api.nebank.com
ANTHROPIC_API_KEY=                               # For AI CAM generation
ENVIRONMENT=development
```

---

## Test Data Available

11 real CAM applications in `/data/` folder:

| App ID | Borrower | Loan Ask | Sanctioned | Bureau | Grade |
|---|---|---|---|---|---|
| app_72klZR5wf2IjE6 | A H M Anayatulla Laskar | ₹18L | ₹7.91L | 735 | B |
| app_7VzxKkBeSG8CSx | Aakash (export) | — | — | — | B |
| app_7fqM0dHaQyf3Jg | Abburi Venkataramana | ₹5L | Reject | 721 | B |
| app_7gFZTEZn4SnrGR | Aatowar Rahman | ₹5L | ₹3.45L | 757 | A |
| app_7ho6UKnNey1Mt6 | A.N. Nithyananda | ₹16L | Reject | 764 | B |
| app_7o91EsZOs4Iti1 | Abbadi Ramya | ₹10L | Reject | 724 | B |
| app_7qvtrRpJAGfZ5O | Abbas Ali | ₹15L | Reject | 753 | B |
| app_7rJaDYTVyakuBs | A Ashinai | ₹3L | Reject | — | B |
| app_7rJnDgalAuhSkI | Aasupathi Subhashini | ₹10L | Reject | 661 | B |
| app_7s6EHM9dlASGjQ | A Ramesh | ₹10L | Reject | 713 | B |
| app_7sZbw4G3e4MgsU | Aanthati Srinivas Goud | ₹10L | Reject | 698 | B |

Each has 325 supporting documents (bank statements, GST returns, business photos, stock declarations, etc.) and ~2,000 editable (yellow) fields per CAM.

---

## File Structure

```
cam-platform/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py                    # Auth dependency (get_current_user)
│   │   │   └── routes/
│   │   │       ├── auth.py                # Register + Login
│   │   │       ├── cases.py               # Case CRUD
│   │   │       ├── documents.py           # Document upload + parse + merge into CAM
│   │   │       ├── cam.py                 # AI CAM generation
│   │   │       ├── cam_xlsm.py            # CAM data retrieval + editing
│   │   │       └── slice_fetch.py         # Slice API integration
│   │   ├── core/
│   │   │   ├── config.py                  # Settings (env vars)
│   │   │   └── security.py               # JWT + bcrypt
│   │   ├── db/
│   │   │   └── base.py                    # SQLAlchemy async engine
│   │   ├── models/
│   │   │   ├── case.py                    # Case model
│   │   │   ├── document.py                # Document model (extracted_data = JSON)
│   │   │   ├── user.py                    # User model
│   │   │   └── cam_report.py              # CAM report model
│   │   ├── schemas/
│   │   │   ├── auth.py                    # Login/Register schemas
│   │   │   └── case.py                    # Case create/list schemas
│   │   ├── services/
│   │   │   ├── parsers/
│   │   │   │   ├── cam_xlsm_parser.py     # ★ Core: 25-sheet XLSM parser (1313 lines)
│   │   │   │   ├── bank_statement_parser.py
│   │   │   │   ├── gst_parser.py
│   │   │   │   ├── financial_statement_parser.py
│   │   │   │   └── bureau_parser.py
│   │   │   ├── validators/
│   │   │   │   └── cross_validator.py     # Cross-validation engine
│   │   │   ├── generators/
│   │   │   │   └── cam_generator.py       # Claude AI CAM writer
│   │   │   └── slice_api.py              # Slice UAT API client
│   │   └── main.py                        # FastAPI app entry
│   ├── seed_data.py                       # Load 11 CAMs into DB
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx              # Case list
│   │   │   ├── CAMDetail.tsx              # ★ Main: 22-tab CAM view (1304 lines)
│   │   │   ├── CaseDetail.tsx             # Redirects to CAM
│   │   │   └── Login.tsx
│   │   ├── components/
│   │   │   └── cam/
│   │   │       ├── EditableField.tsx      # Yellow editable field
│   │   │       ├── DataTable.tsx          # Table with editable cells
│   │   │       └── MetricCard.tsx         # Metric display
│   │   ├── store/auth.ts                  # Auth state
│   │   ├── types/index.ts                 # TypeScript types
│   │   ├── utils/api.ts                   # Axios + helpers
│   │   ├── App.tsx                        # Router
│   │   └── main.tsx                       # Entry
│   ├── package.json
│   └── index.html
├── data/                                   # 11 CAM applications + 325 documents
│   ├── app_7gFZTEZn4SnrGR/
│   │   ├── CAM_Aatowar_Rahman_*.xlsm
│   │   └── documents/
│   │       ├── business_premises--*.jpg
│   │       ├── credit_other-*.pdf
│   │       └── ...
│   ├── app_72klZR5wf2IjE6/
│   │   └── ...
│   └── manifest.json                      # Data manifest
├── docker-compose.yml
└── GUIDE.md                               # This file
```
