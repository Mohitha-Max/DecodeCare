# Decode Care

Decode Care is a medical-report analysis app with a React/Vite frontend and a FastAPI backend.

## Frontend

Requirements: Node.js 20.19+ or 22.12+.

```powershell
cd decode-care
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Backend

Requirements: Python 3.11+, MongoDB, and the system OCR tools required for PDF/image uploads (Tesseract and Poppler).

```powershell
cd backend\decode-care-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set a unique `SECRET_KEY` and any required API credentials in `.env`, then start MongoDB and run:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API is at http://localhost:8000 and its interactive docs are at http://localhost:8000/docs.

## Security notes

- Never commit `.env` files, API keys, or production secrets.
- The frontend chatbot uses built-in fallback responses; do not put a private API key in frontend code or a `VITE_*` variable, because browser users can inspect it.
- The frontend currently has local-storage-based sign-in and report storage. Do not use it to store real patient information or as production authentication.
