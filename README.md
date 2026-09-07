# RoundsAI

A fictional-data clinical-rounding prototype. It turns a clinician-entered round summary into a structured extract, review flag, and editable draft note.

> **Demo / research prototype only.** It is not a diagnostic tool and must not be used for autonomous clinical decision-making or real patient data.

## Milestone 1

```text
clinical text → FastAPI /api/v1/rounds/extract → structured JSON → Next.js dashboard
```

The default extractor is deterministic and runs entirely locally. Set `LLM_PROVIDER=gemini` plus `GEMINI_API_KEY` later to add a model-backed provider without changing the API contract.

## Run locally

Open two terminals from this directory.

```powershell
# Terminal 1: API
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
uvicorn backend.api.main:app --reload --port 8000
```

```powershell
# Terminal 2: dashboard
cd apps\web
npm install
npm run dev
```

Open `http://localhost:3000`. The API interactive docs are at `http://localhost:8000/docs`.

## Structure

```text
apps/web/                 Next.js dashboard
backend/api/              HTTP boundary
backend/agents/           LangGraph workflow
backend/models/           Typed API and workflow models
backend/services/         Provider abstraction and local extraction
knowledge/                Curated sources only; no real patient data
docs/                     Architecture and demo script
```

## Next milestone

Persist fictional rounds to Supabase, then add a small, attributed oncology reference set and FAISS retrieval. Do not ingest undocumented or unlicensed clinical PDFs.
