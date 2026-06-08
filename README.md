# CreditLens — CAM Automation Platform

AI-powered Credit Appraisal Memorandum automation. Upload bank statements, GST returns, financial statements, and bureau reports — get a fully drafted CAM in minutes.

---

## Architecture

```
cam-platform/
├── backend/                   # FastAPI (Python)
│   └── app/
│       ├── api/routes/        # auth, cases, documents, cam
│       ├── models/            # SQLAlchemy ORM models
│       ├── schemas/           # Pydantic schemas
│       └── services/
│           ├── parsers/       # bank_statement, gst, financials, bureau
│           ├── validators/    # cross_validator (Phase 2)
│           └── generators/   # cam_generator using Claude (Phase 3)
├── frontend/                  # React + TypeScript + Tailwind
│   └── src/
│       ├── pages/             # Login, Dashboard, CaseDetail
│       ├── components/        # DocumentUpload, CAMView, NewCaseModal
│       ├── store/             # Zustand auth store
│       └── types/             # TypeScript interfaces
└── docker-compose.yml
```

---

## Quick Start

### Option A — Docker (recommended)

```bash
cd cam-platform

# 1. Copy and fill env
cp backend/.env.example backend/.env
# Set ANTHROPIC_API_KEY in backend/.env

# 2. Start everything
docker compose up --build

# 3. Run DB migrations (first time)
docker compose exec backend alembic upgrade head
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000
API Docs: http://localhost:8000/docs

---

### Option B — Local

**Backend**
```bash
cd backend

# Create virtualenv
python -m venv venv && source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set env vars
cp .env.example .env
# Edit .env: set DATABASE_URL, ANTHROPIC_API_KEY, etc.

# Start Postgres + Redis (via Docker or local)
docker run -d -p 5432:5432 -e POSTGRES_USER=cam_user -e POSTGRES_PASSWORD=cam_pass -e POSTGRES_DB=cam_platform postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev       # runs on http://localhost:3000
```

---

## User Flow

1. **Register / Login** at `/login`
2. **Create a new case** — enter borrower name, PAN, GSTIN, loan amount, type, purpose
3. **Upload documents** — bank statements, GST returns, financials, bureau report (PDF/Excel/JSON)
   - Each file is parsed automatically on upload
4. **Generate CAM** — click "Generate CAM" button
   - Cross-validation runs across all parsed documents
   - Claude writes section commentary (executive summary, banking behaviour, etc.)
   - Full CAM report is displayed with risk flags, financial tables, and recommendation
5. **Review** — underwriter reviews the CAM, makes edits, approves/declines

---

## API Reference

```
POST   /api/v1/auth/register          Register new user
POST   /api/v1/auth/login             Login → JWT token

POST   /api/v1/cases                  Create loan case
GET    /api/v1/cases                  List all cases
GET    /api/v1/cases/{id}             Get case detail

POST   /api/v1/cases/{id}/documents   Upload document (multipart)
GET    /api/v1/cases/{id}/documents   List case documents

POST   /api/v1/cases/{id}/cam         Generate CAM report
GET    /api/v1/cases/{id}/cam/{rid}   Get specific CAM report
```

---

## Supported Document Formats

| Document Type       | Formats          |
|---------------------|------------------|
| Bank Statement      | PDF, XLSX, XLS, CSV |
| GST Return          | JSON (portal), PDF |
| Financial Statement | PDF, XLSX, XLS   |
| Bureau Report       | PDF (CIBIL/Experian/Equifax) |
| ITR / 26AS          | PDF, XML         |

---

## Phase Status

- [x] **Phase 0** — Project scaffold, DB schema, auth, file upload
- [x] **Phase 1** — Bank statement, GST, financial statement, bureau parsers
- [x] **Phase 2** — Cross-validation engine (10 validation rules)
- [x] **Phase 3** — AI CAM generation via Claude API
- [x] **Phase 4** — React underwriter review UI
- [ ] **Phase 5** — PDF/DOCX export, audit trail hardening, multi-tenancy
- [ ] **Phase 6** — LOS REST API webhooks, Celery async parsing

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async URL |
| `REDIS_URL` | Redis URL for Celery |
| `ANTHROPIC_API_KEY` | Claude API key (required for CAM generation) |
| `SECRET_KEY` | JWT signing secret (min 32 chars) |
| `AWS_ACCESS_KEY_ID` | For S3 document storage (prod only) |
| `S3_BUCKET` | S3 bucket name (prod only) |
| `ENVIRONMENT` | `development` (local storage) or `production` (S3) |
