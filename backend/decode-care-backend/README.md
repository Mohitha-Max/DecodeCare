# 🏥 Decode Care — Backend

Production-ready FastAPI backend for the Decode Care medical report analysis platform.

---

## Tech Stack

| Layer        | Technology                          |
|-------------|-------------------------------------|
| Framework   | FastAPI 0.111                        |
| Database    | MongoDB (async via Motor)            |
| Auth        | JWT (python-jose) + bcrypt           |
| OCR         | Tesseract + pdf2image + Pillow       |
| AI          | Anthropic Claude API (claude-sonnet-4)|
| PDF Export  | ReportLab                            |
| Runtime     | Python 3.11+, Uvicorn                |

---

## Quick Start

### 1. Prerequisites

```bash
# MongoDB running locally
mongod --dbpath /data/db

# Tesseract OCR (Ubuntu/Debian)
sudo apt install tesseract-ocr poppler-utils

# Tesseract OCR (macOS)
brew install tesseract poppler
```

### 2. Clone & Install

```bash
cd decode-care-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and SECRET_KEY at minimum
```

### 4. Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs → http://localhost:8000/docs  
ReDoc   → http://localhost:8000/redoc

---

## Project Structure

```
decode-care-backend/
├── app/
│   ├── main.py               # FastAPI app factory, middleware, routers
│   ├── config.py             # Pydantic settings (reads .env)
│   ├── database.py           # Async MongoDB connection + index creation
│   ├── models/
│   │   ├── user.py           # User request/response/DB models
│   │   └── report.py         # Report, LabValues, AIAnalysis models
│   ├── routers/
│   │   ├── auth.py           # POST /auth/register, /login  GET /auth/me
│   │   └── reports.py        # CRUD + upload + PDF download
│   ├── services/
│   │   ├── user_service.py   # Registration, login, profile
│   │   ├── report_service.py # Orchestrates OCR → risk → AI → DB
│   │   └── ai_service.py     # Anthropic API integration
│   └── utils/
│       ├── security.py       # JWT creation/verification, password hashing
│       ├── ocr.py            # Tesseract OCR + lab value regex parser
│       ├── risk.py           # Classification engine + weighted risk score
│       └── pdf_gen.py        # Professional PDF via ReportLab
├── tests/
│   └── test_risk.py          # Unit tests (no DB/network needed)
├── uploads/                  # User-uploaded files (gitignored)
├── frontend-api-client.js    # Drop-in JS API client for the React frontend
├── requirements.txt
└── .env.example
```

---

## API Reference

### Auth

| Method | Endpoint           | Auth | Description           |
|--------|--------------------|------|-----------------------|
| POST   | /api/v1/auth/register | ✗   | Register new user     |
| POST   | /api/v1/auth/login    | ✗   | Login, get JWT        |
| GET    | /api/v1/auth/me       | ✓   | Get current user      |

**Register / Login response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "name": "Ravi Kumar",
    "email": "ravi@example.com",
    "age": 35,
    "created_at": "2025-02-21T10:00:00Z"
  }
}
```

### Reports

| Method | Endpoint                     | Auth | Description                      |
|--------|------------------------------|------|----------------------------------|
| POST   | /api/v1/reports              | ✓    | Create from manual lab values    |
| POST   | /api/v1/reports/upload       | ✓    | Upload PDF/image → OCR → analyse |
| GET    | /api/v1/reports              | ✓    | List user's report summaries     |
| GET    | /api/v1/reports/{id}         | ✓    | Full report detail               |
| GET    | /api/v1/reports/{id}/pdf     | ✓    | Download professional PDF        |
| DELETE | /api/v1/reports/{id}         | ✓    | Delete a report                  |

**Manual create body:**
```json
{
  "lab_values": {
    "hemoglobin": 14.2,
    "fbs": 105,
    "hba1c": 5.9,
    "cholesterol": 210,
    "creatinine": 0.9,
    "systolic": 122,
    "diastolic": 79
  },
  "patient_name": "Ravi Kumar",
  "patient_age": 35
}
```

**Report response (full):**
```json
{
  "id": "...",
  "user_id": "...",
  "patient_name": "Ravi Kumar",
  "patient_age": 35,
  "lab_values": { "hemoglobin": 14.2, "fbs": 105, ... },
  "results": {
    "hemoglobin": { "value": 14.2, "unit": "g/dL", "status": "normal", "normal_range": "13–17 g/dL", "explanation": "..." },
    "fbs":        { "value": 105, "unit": "mg/dL", "status": "high",   "normal_range": "70–99 mg/dL", "explanation": "..." }
  },
  "risk_score": 35,
  "risk_level": "Medium",
  "ai_analysis": {
    "summary": "...",
    "conditions": ["Pre-diabetes"],
    "specialists": ["Endocrinologist"],
    "tips": ["Reduce refined carbohydrates", "Exercise 30 min/day", "Recheck HbA1c in 3 months"]
  },
  "created_at": "2025-02-21T10:00:00Z"
}
```

---

## Connecting the Frontend

Copy `frontend-api-client.js` into your React project (`src/api/client.js`) and set:

```
VITE_API_URL=http://localhost:8000/api/v1
```

Then replace the `localStorage`-based auth in the React component with:

```js
import api from './api/client';

// Register
const { user } = await api.auth.register({ name, email, password, age });

// Login
const { user } = await api.auth.login({ email, password });

// Submit lab values
const report = await api.reports.create(labValues);

// Upload file
const report = await api.reports.upload(file);

// Download PDF (triggers browser download automatically)
await api.reports.downloadPDF(report.id, 'MyReport.pdf');

// List reports
const summaries = await api.reports.list();
```

---

## Running Tests

```bash
pytest tests/ -v
```

---

## Production Checklist

- [ ] Set a strong random `SECRET_KEY` (32+ chars)  
- [ ] Use MongoDB Atlas or a managed instance  
- [ ] Set `APP_ENV=production`  
- [ ] Put Uvicorn behind Nginx or use Gunicorn workers  
- [ ] Store uploads on S3/GCS instead of local disk  
- [ ] Add rate limiting (e.g. `slowapi`)  
- [ ] Enable HTTPS  
- [ ] Rotate JWT secret periodically  
