# PROJECT_NOTICE.md

Project memory for future Codex work. This repo is a production Pathway Ministry AI chatbot system; prefer small, reviewable changes and inspect targeted files before editing.

## Project Summary

This project is a Retrieval-Augmented Generation chatbot for Pathway Ministry / Pathway Training. It has four main parts:

- `webapp/`: Vite + React chat UI used standalone, embedded in WordPress, and hosted as the full-screen Ask AI iframe app.
- `rag-backend/`: FastAPI RAG API using LangChain, Chroma, and either OpenAI or Ollama.
- `plugin/`: WordPress plugin that injects the chat widget site-wide or via `[rag_chatbot]`.
- `dashboard/`: Local Express dashboard for launching the backend/frontend, local document management, local prompt editing, service monitoring, and git actions. Remote operations remain present but are locked until deployment testing is complete.

## Current Git/Workspace Notes

- `git status` may fail with a dubious ownership warning. Use:
  `git -c safe.directory='E:/Pathway/AI Chat/Pathway-AI-Chatbot' status --short`
- At scan time, existing uncommitted/untracked items included:
  - Modified: `webapp/page-ask-ai.php`
  - Untracked: `AGENTS.md`, `PROJECT_NOTES.MD`, `TASKS.md`, `bash.exe.stackdump`
- Do not overwrite or revert user changes without explicit permission.

## Tech Stack

- Frontend widget: React 18, TypeScript, Vite 6, `react-icons`.
- Backend API: Python 3.10+, FastAPI, Pydantic, LangChain, Chroma, OpenAI/Ollama providers, `python-dotenv`, `pypdf`, PyMuPDF, Tesseract OCR through `pytesseract`, RapidOCR fallback, and BeautifulSoup loader support.
- Dashboard: Node/Express, Multer, SSH2, built-in `http`, `https`, `crypto`, `child_process`.
- WordPress: PHP plugin and a WordPress page template for authenticated Ask AI iframe access.
- Vector store: Chroma persisted under `rag-backend/chroma_store`.
- Document source directory: `rag-backend/docs` by default, configurable via `DOCS_DIR`.

## Main Runtime Flows

### Public Chat

1. React UI sends unauthenticated requests to `POST /api/chat`.
2. Backend stores simple in-memory conversation turns in `CONV`.
3. `RagPipeline.answer()` retrieves context from Chroma, invokes the LLM, prepares citations, and returns `{ answer, citations, conversation_id }`.

### Authenticated Ask AI

1. WordPress page template `webapp/page-ask-ai.php` requires a logged-in user with `edit_posts`.
2. It calls `pathway_rag_mint_current_user_token(600)` and embeds the hosted chat app in an iframe with `apiBase`, `token`, `exp`, `source`, and `title` query params.
3. React detects the token and uses `POST /api/ask`.
4. Backend validates an HS256 JWT using `PATHWAY_RAG_JWT_SECRET` and required capability from `JWT_REQUIRED_CAP` (default `edit_posts`).

### File Upload / Reload

- `POST /api/upload` saves an uploaded file to `DOCS_DIR`, enforces `MAX_UPLOAD_MB` (default 50), then calls `PIPE.reload()`.
- `PIPE.reload()` now synchronizes incrementally: it fingerprints files, adds new files, replaces changed files, removes deleted files, and skips unchanged files.
- Existing legacy chunks have no fingerprint metadata, so the first reload after this change performs a one-time migration re-index.
- PDF loading uses embedded text first and applies OCR only to pages below `PDF_OCR_MIN_TEXT_CHARS`.
- Scanned PDF OCR defaults to `auto`: it uses Tesseract when available and otherwise falls back to the locked RapidOCR ONNX engine.
- OCR settings are included in PDF index metadata, so existing PDFs are reprocessed once after this feature is deployed and again whenever OCR settings change.
- `POST /api/reload` synchronizes the vector index and requires JWT auth in `main.py`.
- Dashboard local uploads are proxied to authenticated `POST /api/upload`, and local deletions call authenticated `POST /api/reload`.
- When the backend `.env` has no JWT secret, the dashboard creates an in-memory local secret and passes it only to the backend process it launches.
- Coworker-specific SSH paths remain unchanged for future deployment work, but all remote routes are currently locked.

## Important Files

- `README.md`: Current public setup notes. Some text has mojibake/encoding artifacts.
- `TASKS.md`: Intended ongoing task tracker.
- `PROJECT_NOTES.MD`: Existing placeholder project notes file; user requested this richer `PROJECT_NOTICE.md`.
- `webapp/src/App.tsx`: Main chat UI, message state, sessionStorage history, token-aware endpoint selection, citations, typing animation, clear-chat button.
- `webapp/src/Widget.tsx`: Floating launcher/popup wrapper; posts iframe resize messages to parent and supports vertical dragging.
- `webapp/src/main.tsx`: Mounts React on `#rag-chatbot-root`; currently defaults to live API `https://api.chat.pathway.training`.
- `webapp/src/styles.css`: Main widget/fullscreen styles. Uses Pathway teal (`#609693`) and chat bubble styling.
- `webapp/src/api.ts`: Older/minimal API helper for `/api/chat`; `App.tsx` currently uses its own inline `askRag`.
- `webapp/index.html`: Standalone Vite test page; currently configured for live API by default.
- `webapp/page-ask-ai.php`: WordPress page template for authenticated full-screen Ask AI iframe.
- `webapp/vite.config.ts`: Builds fixed asset names into `webapp/dist/assets/main.js` and `styles.css`; dev server uses strict port `5173`.
- `webapp/src/embed-loader.js`: Simple remote iframe injector pointing at an Amplify URL.
- `plugin/rag-chatbot.php`: WordPress plugin; shortcode and site-wide footer widget; localizes `RAG_CHATBOT_CONFIG`.
- `plugin/dist/`: Built assets consumed by WordPress plugin.
- `rag-backend/main.py`: FastAPI app, JWT verification, chat/ask/upload/reload/files routes, citation URL normalization.
- `rag-backend/rag.py`: RAG pipeline, document loading, chunking, Chroma retrieval, LLM prompt construction, citation handling, retry behavior.
- `rag-backend/prompt.txt`: Bot behavior/instruction prompt read on each query.
- `rag-backend/.env.example`: Safe env template. A real `.env` exists locally; avoid exposing secrets.
- `rag-backend/context.txt`: Local debug/output file; can be large and generated.
- `dashboard/server.js`: Local ops dashboard backend; includes live/local toggles, SSH config, remote docs management, prompt sync, git routes.
- `dashboard/public/index.html`: Single-file dashboard UI.
- `dashboard/start.bat`: Installs dashboard deps if missing, opens `http://localhost:3131`, runs `node server.js`.

## Commands

Frontend:

```bash
cd webapp
npm install
npm run dev
npm run build
```

Backend:

```bash
cd rag-backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --no-reload
```

Alternative from README:

```bash
cd rag-backend
python main.py
```

Dashboard:

```bash
cd dashboard
npm install
npm start
```

or run `dashboard/start.bat` on Windows.

## API Endpoints

Backend:

- `GET /api/health`: health check.
- `POST /api/chat`: public chat endpoint.
- `POST /api/ask`: authenticated chat endpoint with history support.
- `GET /api/files/{name}`: serves files from `DOCS_DIR`.
- `POST /api/upload`: authenticated upload and re-index.
- `POST /api/reload`: authenticated index reload.

Dashboard:

- `GET /api/status`: reports local-only mode and whether remote operations are enabled.
- `POST /api/local/start/backend`, `POST /api/local/start/frontend`: launch local services independently.
- `GET /api/local-health`, `GET /api/local-logs`: local backend/frontend status and backend logs.
- `GET /api/docs`, `POST /api/docs/upload`, `DELETE /api/docs/:filename`: local document operations using backend authentication for indexing.
- `GET /api/prompt`, `POST /api/prompt`: local prompt editing.
- `POST /api/toggle`, `POST /api/server/sync-prompt`, `POST /api/server/restart`: return HTTP 423 while remote deployment is locked.

## Live vs Local Mode

The dashboard toggles exact string blocks in these files:

- `webapp/index.html`
- `webapp/src/main.tsx`
- `rag-backend/rag.py`

Live defaults found during scan:

- Frontend/API base: `https://api.chat.pathway.training`
- Hosted full-screen chat iframe: `https://chat.pathway.training/`
- `embed-loader.js` iframe: `https://main.d2wlgxponag5j6.amplifyapp.com/`
- Remote docs path in dashboard: `/home/ubuntu/Pathway-AI-Chatbot/rag-backend/docs`
- Remote backend process managed by PM2 name `rag-backend`

The old exact-string live/local toggle definitions remain for future deployment work, but the dashboard no longer invokes them while remote mode is locked.

## Backend/RAG Behavior Notes

- `RagPipeline.from_disk()` builds Chroma if missing/empty; otherwise opens persisted index.
- Supported source files: `.md`, `.txt`, `.html`, `.pdf`.
- Text PDFs are read directly; image-only scanned PDF pages are rendered with PyMuPDF and recognized with Tesseract or the locked RapidOCR fallback.
- OCR is configurable with `PDF_OCR_ENABLED`, `PDF_OCR_ENGINE`, `PDF_OCR_MIN_TEXT_CHARS`, `PDF_OCR_DPI`, `PDF_OCR_LANGUAGE`, and optional `TESSERACT_CMD`.
- Chunking is content-aware and configurable with `CHUNK_MIN_SIZE`, `CHUNK_MAX_SIZE`, and `CHUNK_OVERLAP`; legacy `CHUNK_SIZE` remains the maximum-size fallback.
- Changing chunk-size settings causes affected files to be re-indexed even when their contents are unchanged.
- `LLM_PROVIDER=openai` by default; Ollama support exists.
- OpenAI defaults: `gpt-4o-mini`, `text-embedding-3-small`.
- Citation URLs use `API_BASE` and default to `http://localhost:8000/api/files/{filename}` for the current local-only dashboard; page fragments are preserved where possible.
- Adjacent-page expansion skips documents such as `.txt`, `.md`, and `.html` files when they do not have numeric page metadata.
- `prompt.txt` is loaded fresh inside `RagPipeline.answer()` for each query.
- The backend conversation store is in-memory only and is not durable.
- `App.tsx` also persists visible chat history in `sessionStorage`.

## UI/Design Notes

- Widget uses a fullscreen/root layout when mounted in the iframe or standalone root.
- Chat style is simple Pathway-branded bubbles:
  - Launcher teal: `#609693`
  - User bubble: `#BCE4E1`
  - AI bubble: `#e3e5e7`
- Header shows `webapp/public/Logo.png` as `/Logo.png`.
- Clear chat button currently uses `GiNuclearBomb` from `react-icons/gi`.
- Disclaimer appears above the input: "This bot can make mistakes..." (currently the source file contains mojibake for symbols).
- The floating widget is left-side oriented in `Widget.tsx`/CSS and sends parent `postMessage` resize events.

## Known Issues / Risks

- Several files contain mojibake/encoding artifacts for punctuation and icons. Avoid broad formatting rewrites unless the task is specifically to fix encoding.
- `rag-backend/package.json` is empty even though `package-lock.json` and `node_modules` exist.
- `rag-backend/README.md` is empty; top-level `README.md` has the useful setup docs.
- `App.tsx` duplicates API helper logic instead of using `webapp/src/api.ts`.
- `dashboard/server.js` has hard-coded SSH host, user, PEM path, remote paths, and exact text toggle patterns.
- Dashboard git commands may fail unless Git safe-directory ownership is configured for the current user.
- Dashboard local deletion removes the local file and calls authenticated backend `/api/reload`; remote deletion remains locked.
- If local deletion cannot reload the backend index, the dashboard restores the original source file.
- Uploads accept `.txt`, `.md`, `.html`, and `.pdf`; unsupported types return HTTP 400.
- Uploads use a temporary file and atomic replacement so oversized same-name uploads preserve the existing document.
- `/api/upload` and `/api/reload` require JWT auth, and the local dashboard generates a short-lived token using the configured secret or its process-local fallback.
- Real `.env`, vector store, docs, node_modules, and generated files exist locally; avoid committing secrets or generated state.

## Verification Guidance

When changing frontend:

- Run `cd webapp && npm run build` to verify TypeScript/Vite and refresh `plugin/dist`.
- If testing interactively, run backend on `localhost:8000` and Vite on `localhost:5173`.

When changing backend:

- Prefer a lightweight import/syntax check first.
- Run the FastAPI server if env/secrets and vector index are available.
- Be aware that importing `main.py` initializes `RagPipeline.from_disk()` and may require embeddings/provider credentials.

When changing dashboard:

- Run `cd dashboard && npm start` if Node dependencies exist.
- Test local-only routes before remote SSH operations.
- Remote docs/prompt/server actions require the PEM path and network access.

When changing WordPress/plugin behavior:

- Build the webapp so `plugin/dist/assets/main.js` and `styles.css` are refreshed.
- Confirm `RAG_CHATBOT_API_BASE` and optional `RAG_CHATBOT_DEV_SERVER` behavior.
- For authenticated Ask AI, confirm the token minting function exists in the active WordPress environment.

## Preferred Change Style

- Keep changes narrow and production-safe.
- Reuse existing files/patterns.
- Do not add dependencies unless clearly necessary.
- Do not reformat large files casually; encoding artifacts make noisy diffs likely.
- Update this notice when discovering project facts that future Codex runs should remember.
