from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, cases, documents, cam, cam_xlsm, slice_fetch
from app.db.base import Base, engine
from app.models import User, Case, Document, CAMReport  # noqa: F401 — register models for create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables on startup (dev convenience; use alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="EDL - SLICE CAM Platform",
    description="AI-powered Credit Appraisal Memorandum automation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(cases.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(cam.router, prefix="/api/v1")
app.include_router(cam_xlsm.router, prefix="/api/v1")
app.include_router(slice_fetch.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "EDL - SLICE CAM Platform"}
