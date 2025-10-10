# RAG Chatbot (WordPress + React + FastAPI)

A lightweight Retrieval‑Augmented Generation chatbot for WordPress:
- React widget (Vite) for the UI
- FastAPI backend for chat endpoints and retrieval
- WordPress plugin to embed a floating chat site‑wide or via shortcode

## Repository Layout
- `rag-backend/`: FastAPI app exposing `/api/chat`
- `webapp/`: React widget; build outputs to `plugin/dist/`
- `plugin/`: WordPress plugin (`rag-chatbot.php`) that injects the widget

## Prerequisites
- Node.js 18+ and npm
- Python 3.10+
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
- `POST /api/chat` → `{ answer, citations, conversation_id }`

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

## 5) Troubleshooting
- Widget not visible in WP:
  - Ensure plugin is activated and `plugin/dist/` exists (`npm run build`).
  - Verify `RAG_CHATBOT_API_BASE` points to your reachable backend.
- CORS errors: update `CORS_ORIGINS` in `rag-backend/main.py` or set env var.
- Duplicate widget: avoid using shortcode and site‑wide at the same time on the same page (site‑wide auto‑suppresses when shortcode is present).

---

## 6) Deploy
- Backend: deploy FastAPI behind a reverse proxy; set `RAG_CHATBOT_API_BASE` to its public URL.
- WordPress: run `npm run build`, deploy `plugin/` to the server, activate.
- Disable site‑wide widget globally if needed:
```php
add_filter('rag_chatbot_sitewide_enabled', '__return_false');
```

---

## License
MIT