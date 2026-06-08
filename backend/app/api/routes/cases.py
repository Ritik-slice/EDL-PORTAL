import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.case import Case, CaseStatus
from app.models.user import User
from app.schemas.case import CaseCreate, CaseOut, CaseListItem

router = APIRouter(prefix="/cases", tags=["cases"])


def _make_ref() -> str:
    return "CL-" + str(uuid.uuid4())[:8].upper()


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: CaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = Case(
        id=str(uuid.uuid4()),
        case_ref=_make_ref(),
        created_by=current_user.id,
        organisation_id=current_user.organisation_id,
        **payload.model_dump(),
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return CaseOut.model_validate(case)


@router.get("", response_model=List[CaseListItem])
async def list_cases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case)
        .where(Case.organisation_id == current_user.organisation_id)
        .order_by(Case.created_at.desc())
        .limit(100)
    )
    return [CaseListItem.model_validate(c) for c in result.scalars().all()]


@router.get("/{case_id}", response_model=CaseOut)
async def get_case(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return CaseOut.model_validate(case)
