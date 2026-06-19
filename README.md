# Wohlig Workforce Intelligence Pipeline

Automated end-to-end pipeline for extracting workforce data from Google Drive, auditing it via an LLM (Ollama/Gemini), rendering an HTML/PDF report, and optionally emailing it on a schedule.

Built for **Wohlig** to replace manual report generation with a single-click dashboard.

---

## What it does

| Step | Action |
|------|--------|
| 1 | **Google Drive** — Download an Excel file with employee data |
| 2 | **Extract** — Parse all sheets (Active, Projects, Retainers, etc.) into JSON |
| 3 | **LLM Audit** — Send the structured data to Ollama for workforce analysis (bench count, allocations, multi-assigned employees) |
| 4 | **Report** — Render a branded HTML report from a Jinja2 template |
| 5 | **PDF** — Convert the HTML report to PDF (Chrome headless → WeasyPrint fallback) |
| 6 | **Email** — Optionally email the PDF to configured recipients |

---

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Next.js 14     │─────▶│   FastAPI        │─────▶│   Python         │
│   Dashboard      │      │   SSE Streaming  │      │   Pipeline       │
│   Port 3000      │      │   Port 8000      │      │                  │
└──────────────────┘      └──────────────────┘      │  • drive_extract │
        │                      │                      │  • llm_analysis  │
        │                      ▼                      │  • report_service│
        │               ┌──────────────────┐        └──────────────────┘
        │               │  APScheduler     │                      │
        │               │  (polls every   │◀─────────────────────┘
        │               │   minute)        │
        │               └──────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│   File Outputs                                                      │
│   • all_files_extracted_data.json     ← Drive extraction output   │
│   • data/workforce_analysis_output.json ← LLM audit result          │
│   • reports/workforce_report.html      ← Rendered HTML            │
│   • reports/workforce_report.pdf        ← PDF attachment            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **Backend** | FastAPI, Uvicorn, SSE (Server-Sent Events) |
| **Pipeline** | Pure Python (pandas, openpyxl, jinja2, ollama) |
| **Scheduler** | APScheduler (BackgroundScheduler) |
| **AI** | Ollama (`deepseek-v4-flash:cloud`) via cloud provider |
| **Data Source** | Google Drive API (Service Account) |
| **PDF Gen** | Chrome headless → WeasyPrint → pdfkit (fallback chain) |
| **Email** | SMTP (Gmail / any provider) |
| **Deployment** | Vercel (frontend) + Local/VPS (backend) |

---

## Quick Start

### Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **Google Chrome** (for PDF generation) OR **WeasyPrint** (`pip install weasyprint`)
- A Google Cloud service account with Drive API enabled
- An Ollama API key (via cloud provider — not local Ollama server)

---

### 1. Clone & Install

```bash
git clone https://github.com/dhruvsolanki-wohlig/pipeline.git
cd pipeline

# Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt

# Next.js frontend
cd dashboard
npm install
```

---

### 2. Configure Environment

Create `.env` in the project root:

```env
# ── Ollama LLM ────────────────────────────────────────
OLLAMA_API_KEY=your-ollama-api-key
OLLAMA_MODEL=deepseek-v4-flash:cloud

# ── Google Drive ─────────────────────────────────────
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
DRIVE_FILE_NAME=Wohlig Active Employee Data.xlsx
DRIVE_FILE_ID=your-file-id-from-drive-link

# ── SMTP / Email ─────────────────────────────────────
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# ── Output Files ─────────────────────────────────────
OUTPUT_JSON_FILE=all_files_extracted_data.json
```

> **Gmail Users:** Generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

> **Google Drive File ID:** From the share link `https://drive.google.com/file/d/{FILE_ID}/view`

---

### 3. Run Locally

**Option A — One command (recommended)**

```bash
chmod +x start.sh
./start.sh
```

Opens: `http://localhost:3000`

**Option B — Separate terminals**

```bash
# Terminal 1 — Backend
source .venv/bin/activate
python3 -m uvicorn api.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — Frontend
cd dashboard
npm run dev
```

---

## How it works

### Pipeline Stages

1. **`drive_extract.py`**
   - Authenticates to Google Drive via service account
   - Downloads the Excel file to `data/`
   - Parses every sheet using `pandas` + `openpyxl`
   - Handles "Unnamed" columns by promoting row 0 as headers
   - Writes `all_files_extracted_data.json` (master dataset)

2. **`llm_analysis.py`**
   - Loads the extracted JSON
   - Builds a strict system prompt instructing the LLM to:
     - Identify active employees vs bench/unallocated
     - Map project allocations across Projects, Retainers, Internal sheets
     - Flag multi-allocated employees
     - Exclude closed/finished projects and learning tasks
   - Sends data to Ollama (`deepseek-v4-flash:cloud`)
   - Extracts JSON from the LLM response (handles markdown fences, nested formats, etc.)
   - Writes `data/workforce_analysis_output.json`

3. **`report_service.py`**
   - Loads the LLM analysis JSON
   - Flattens all possible `project_allocations` formats (string lists, object lists, grouped by type, etc.)
   - Builds type mappings from `active_projects_table`
   - Computes true totals from the raw data (not trusting LLM math)
   - Enriches unallocated employees with role & manager from the raw Active sheet
   - Renders `workforce_report_template.html` via Jinja2
   - Writes `reports/workforce_report.html`
   - Auto-detects logo: first `.webp` in `ui/`, falls back to `dashboard/public/logo.webp`

---

## Dashboard Features

### Generate Report Only
Runs the full pipeline (Drive → LLM → Report). If stage outputs already exist on disk, the dashboard:
- Marks those stages as **"Already complete ✓"**
- Skips re-running them
- Routes to `/api/generate-report` to only re-render the HTML

### Send Email
- Opens the **Settings** panel
- Toggle recipients (click to select/unselect)
- Customize subject & body
- Click **Send Email** — PDF is auto-generated and sent

### Schedule Automation

| Mode | How it works |
|------|-------------|
| **One-time** | Set `Active = ON`, pick a `Next Run` datetime, click **Save**. The backend polls every minute and triggers at the scheduled time. |
| **Continuous** | Set `Active = ON`, `Continuous = ON`, set `Interval` (hours), and optionally a `Cron Expression`. The pipeline runs, emails recipients, then auto-advances `next_run` by the interval. |

To stop: turn **Active = OFF** and **Save**.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/pipeline-status` | GET | Returns which stages have output files on disk (used by dashboard to pre-mark completed stages) |
| `/api/run-pipeline` | POST | Full pipeline with live SSE stream (Drive → LLM → Report) |
| `/api/generate-report` | POST | Report-only mode with SSE stream (skips Drive + LLM, marks them completed) |
| `/api/report` | GET | Returns the latest rendered HTML report |
| `/api/settings` | GET / POST | Load / save automation settings |
| `/api/send-email` | POST | Send the current report PDF to selected recipients |
| `/api/run-and-email` | POST | Full pipeline + email with SSE stream |

> All pipeline endpoints return **SSE (Server-Sent Events)** with per-stage status updates and output file metadata.

---

## File Structure

```
pipeline/
├── .env                              # Environment variables (never commit)
├── .gitignore                        # Ignores .venv, node_modules, reports, data, etc.
├── README.md                         # ← You are here
├── start.sh                          # One-command launcher (backend + frontend)
│
├── app.py                            # Standalone CLI pipeline orchestrator
├── drive_extract.py                  # Google Drive auth + Excel extraction
├── llm_analysis.py                 # Ollama integration + adaptive JSON parsing
├── report_service.py               # HTML report renderer (Jinja2 + enrichment)
├── workforce_report_template.html    # Branded report template
│
├── api/
│   ├── main.py                       # FastAPI app, SSE streaming, scheduling
│   ├── requirements.txt              # Backend Python dependencies
│   ├── settings_manager.py          # JSON-based schedule settings persistence
│   ├── email_sender.py              # SMTP + PDF generation fallback chain
│   └── schedule_settings.json       # Runtime settings storage (auto-created)
│
├── dashboard/                        # Next.js 14 frontend
│   ├── package.json
│   ├── next.config.mjs               # Proxies /api/* → FastAPI backend
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── public/
│   │   └── logo.webp                 # Company logo (used in report)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Main dashboard (pipeline overlay, settings, viewer)
│   │   └── globals.css
│   └── components/                   # (reserved for future components)
│
├── data/                             # Generated at runtime (ignored by git)
│   └── Wohlig Active Employee Data.xlsx  # Downloaded Excel file
│
├── reports/                          # Generated at runtime (ignored by git)
│   ├── workforce_report.html         # Rendered HTML
│   └── workforce_report.pdf          # PDF attachment
│
├── ui/                               # Static assets (logos, etc.)
│   └── index.html                    # Legacy standalone HTML version
│
└── .github/workflows/
    └── cron.yml                      # GitHub Action: pings Vercel every 5 min
```

---

## Key Design Decisions

### 1. Adaptive JSON Parsing (`llm_analysis.py`)
The LLM can wrap JSON in markdown fences, return streaming chunks, or emit malformed JSON. The `extract_json_from_response()` function tries 3 strategies: markdown regex, bracket scanning, raw text.

### 2. Format-Agnostic Allocations (`report_service.py`)
The LLM may return `project_allocations` as flat string lists, employee objects, grouped by type, or a flat array of project objects. `_flatten_allocations()` detects the format automatically and normalizes to `project_name → [employee_names]`.

### 3. Smart Stage Skipping (`dashboard + api/main.py`)
Instead of re-running Drive extraction and LLM analysis every time, the dashboard hits `/api/pipeline-status` before streaming. If the output files exist, it routes to `/api/generate-report` (report-only mode), which emits `completed` events for Drive and LLM immediately, then only streams the report stage.

### 4. Live Log Streaming (`_QueuedStream`)
Each pipeline stage runs in a daemon thread with stdout/stderr captured into a queue. Lines are yielded via SSE in real-time so the dashboard shows live logs.

### 5. PDF Fallback Chain
Chrome headless is preferred (renders CSS perfectly). If unavailable, falls back to WeasyPrint, then pdfkit.

---

## Deployment

### Vercel (Frontend)

1. Connect the repo to Vercel
2. Set build command: `cd dashboard && npm run build`
3. Set output directory: `dashboard/out` (ensure `next.config.mjs` has `output: 'export'`)

> **Note:** The backend (FastAPI) cannot run on Vercel Serverless Functions because it uses `BackgroundScheduler` and SSE. Host the backend separately (Railway, Render, Fly.io, or a VPS).

### Backend Hosting

Any platform that supports long-running Python processes:

```bash
pip install -r api/requirements.txt
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Then update `dashboard/next.config.mjs` to proxy `/api/*` to your hosted backend URL.

### GitHub Actions Cron

`.github/workflows/cron.yml` pings your deployed Vercel frontend every 5 minutes. On Vercel, you should have a serverless function or cron handler that triggers the backend. Alternatively, keep the backend running with APScheduler on a persistent host.

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OLLAMA_API_KEY` | Yes | Your Ollama cloud API key |
| `OLLAMA_MODEL` | Yes | Model name (default: `deepseek-v4-flash:cloud`) |
| `OLLAMA_HOST` | No | API base URL (default: `https://ollama.com`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Inline service account JSON key (preferred) |
| `DRIVE_FILE_NAME` | Yes | Excel filename |
| `DRIVE_FILE_ID` | Yes | Google Drive file ID |
| `EMAIL_USER` | Yes | SMTP username |
| `EMAIL_PASSWORD` | Yes | SMTP password (App Password for Gmail) |
| `SMTP_HOST` | No | Default: `smtp.gmail.com` |
| `SMTP_PORT` | No | Default: `587` |
| `OUTPUT_JSON_FILE` | No | Default: `all_files_extracted_data.json` |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `Backend not running` | FastAPI not started | Run `python3 -m uvicorn api.main:app --host 127.0.0.1 --port 8000` |
| `No module named 'fastapi'` | Missing Python deps | `pip install -r api/requirements.txt` |
| Pipeline stages stuck on "Waiting..." | Previous run files exist but pipeline re-runs anyway | Already fixed — dashboard now calls `/api/pipeline-status` and skips to `/api/generate-report` |
| `SMTP auth failed` | Using Gmail without App Password | Enable 2FA → generate App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |
| `PDF generation failed` | Chrome not installed | Install Google Chrome, or `pip install weasyprint` |
| LLM returns empty/malformed JSON | Model incompatibility or context too large | Check model availability; reduce input data if it exceeds 150K chars |
| Report shows empty/missing cards | LLM used unexpected key casing | `report_service.py` uses `_safe_get()` with multiple key fallbacks — keys are normalized |
| CORS error | Frontend/backend ports mismatch | Ensure backend is `127.0.0.1:8000` and frontend proxies `/api/*` correctly |

---

## Known Issues

- [Issue 1: Next.js Proxy Timeout Aborting Pipeline](listed_issues/issue_1.md)

---

## License

Proprietary — Wohlig Transformations Pvt. Ltd.
