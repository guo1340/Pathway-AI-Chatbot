# RAG Chatbot (WordPress + React + FastAPI)

A lightweight Retrieval‑Augmented Generation chatbot for WordPress:

- React widget (Vite) for the UI
- FastAPI backend for chat endpoints and retrieval
- WordPress plugin to embed a floating chat site‑wide or via shortcode

## Repository Layout

- `rag-backend/`: FastAPI app exposing authenticated `/api/ask`
- `webapp/`: React widget; build outputs to `plugin/dist/`
- `plugin/`: WordPress plugin (`rag-chatbot.php`) that injects the widget

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- Optional Tesseract OCR for image-only scanned PDFs; the default automatic mode falls back to RapidOCR
- A WordPress site (local or remote)

---

## 1) Backend (FastAPI)

### Install

```bash
cd rag-backend
python -m venv .venv && source .venv/bin/activate
pip install -U pip
pip install -e .
pip install uvicorn python-dotenv
```

If you prefer `uv`:

```bash
cd rag-backend
uv venv && source .venv/bin/activate
uv pip install -e . uvicorn python-dotenv
```

For scanned PDF indexing, the default `PDF_OCR_ENGINE=auto` uses Tesseract when
available and falls back to the locked RapidOCR dependency. To require
Tesseract, set `PDF_OCR_ENGINE=tesseract`; if it is not on `PATH`, also set
`TESSERACT_CMD` to the full executable path. Native text PDFs do not invoke OCR.

### Run

```bash
cd rag-backend
source .venv/bin/activate
python main.py
# or: uvicorn main:app --reload --port 8000
```

Defaults:

- Port: `8000`
- CORS: allows `http://localhost:5173` (Vite dev)

Endpoints:

- `GET /api/health` → `{ "status": "ok" }`
- `POST /api/ask` with a WordPress bearer JWT → `{ answer, citations, conversation_id, remaining_tokens }`

Document indexing/RAG logic is in `rag-backend/rag.py` via `RagPipeline`.

---

## 2) Webapp (React widget)

### Install deps

```bash
cd webapp
npm install
```

### Develop (standalone)

```bash
npm run dev
# Vite on http://localhost:5173
```

Open `webapp/index.html` to test against the backend at `http://localhost:8000`.

### Build → copy assets to WordPress plugin

```bash
npm run build
```

This builds into `webapp/dist/` and copies files to `plugin/dist/`.

---

## 3) WordPress Plugin

The plugin can render:

- Site‑wide floating widget (footer hook, default ON)
- Per‑page widget via `[rag_chatbot]` shortcode

### Install into WordPress

1. Build webapp assets: `npm run build` (populates `plugin/dist/`).
2. Copy the entire `plugin/` folder to `wp-content/plugins/rag-chatbot/`.
3. Activate “RAG Chatbot” in WP Admin → Plugins.

### Configure

- Set backend URL in `wp-config.php`:

```php
define('RAG_CHATBOT_API_BASE', 'http://localhost:8000');
```

- Optional: develop inside WP with Vite hot reload:

```php
define('RAG_CHATBOT_DEV_SERVER', 'http://localhost:5173');
```

- Filters:
  - `rag_chatbot_api_base`
  - `rag_chatbot_sitewide_enabled` (default true)
  - `rag_chatbot_sitewide_atts` (default `{ source: 'site', title: 'Ask our AI' }`)

### Ask AI role access

The full-screen Ask AI page template allows users with the WordPress `contributor` role. It also allows standard higher roles that have `edit_posts`, such as Author, Editor, and Administrator. The backend token capability remains:

```env
JWT_REQUIRED_CAP=edit_posts
```

For another role later, add that role slug to `webapp/page-ask-ai.php` and keep the WordPress token issuer plus backend `JWT_REQUIRED_CAP` aligned with the capability the backend should require.

### Use

- Site‑wide floating widget appears bottom‑right on all pages by default.
- Shortcode on a page/post (suppresses the site‑wide instance on that page):

```
[rag_chatbot source="site" title="Ask our AI"]
```

---

## 4) Common Workflows

- Edit UI: change `webapp/src/*`, run `npm run dev`, then `npm run build` to update `plugin/dist/`.
- Edit backend: change `rag-backend/*` and restart `python main.py`.

---

## 5) Local Operations Dashboard

The dashboard runs locally at `http://localhost:3131`. Local document operations
do not require SSH. Selecting the EC2 document target requires a local
`dashboard/.env` file containing the server connection settings.

### Configure EC2 SSH access

From the repository root on Windows PowerShell:

```powershell
Copy-Item dashboard/.env.example dashboard/.env
notepad dashboard/.env
```

On macOS or Linux:

```bash
cp dashboard/.env.example dashboard/.env
```

Set the local values:

```dotenv
PATHWAY_SSH_HOST=your-ec2-public-ip-or-dns-name
PATHWAY_SSH_USER=ubuntu
PATHWAY_SSH_KEY_PATH=C:/full/path/to/Pathway-Backend-Key.pem
PATHWAY_REMOTE_ROOT=/home/ubuntu/Pathway-AI-Chatbot
```

Notes:

- Forward slashes work well in Windows paths.
- `PATHWAY_SSH_KEY_PATH` must point to the PEM file on the computer running the dashboard.
- `dashboard/.env` and `*.pem` are ignored by Git and must not be committed.
- Restart the dashboard after changing `.env`.

Start the dashboard:

```powershell
cd dashboard
npm install
npm start
```

Open `http://localhost:3131`, then use the Local/EC2 control in the Documents
card. EC2 upload and deletion use SSH/SFTP and restart the remote
`rag-backend` PM2 process so its index reloads.

### Verify SSH settings

In PowerShell, confirm the configuration exists without printing its values:

```powershell
Test-Path dashboard/.env
Select-String -Path dashboard/.env -Pattern '^PATHWAY_SSH_(HOST|USER|KEY_PATH)='
```

Test the same SSH key and host directly:

```powershell
ssh -i "C:\full\path\to\Pathway-Backend-Key.pem" ubuntu@your-ec2-public-ip-or-dns-name
```

If the dashboard reports `PATHWAY_SSH_HOST is not configured`, confirm that:

1. The file is named exactly `.env`, not `.env.txt`.
2. It is inside the `dashboard` directory.
3. `PATHWAY_SSH_HOST` has a non-empty value.
4. The dashboard was restarted after the file was created or changed.

---

## 6) Troubleshooting

- Widget not visible in WP:
  - Ensure plugin is activated and `plugin/dist/` exists (`npm run build`).
  - Verify `RAG_CHATBOT_API_BASE` points to your reachable backend.
- CORS errors: update `CORS_ORIGINS` in `rag-backend/main.py` or set env var.
- Duplicate widget: avoid using shortcode and site‑wide at the same time on the same page (site‑wide auto‑suppresses when shortcode is present).
- Dashboard EC2 documents show `PATHWAY_SSH_HOST is not configured`: create
  `dashboard/.env` from `.env.example`, fill in its SSH values, and restart the dashboard.

---

## 7) Deploy

- Backend: deploy FastAPI behind a reverse proxy; set `RAG_CHATBOT_API_BASE` to its public URL.
- WordPress: run `npm run build`, deploy `plugin/` to the server, activate.
- Disable site‑wide widget globally if needed:

```php
add_filter('rag_chatbot_sitewide_enabled', '__return_false');
```

---

## License

MIT

### Disclaimer

- Currently this chat bot does not store conversation contexts. This means that it cannot refer answers or questions asked prior
- When asking question, make sure to include all information needed
