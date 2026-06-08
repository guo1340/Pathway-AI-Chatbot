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

1. React UI sends all chatbot requests to authenticated `POST /api/ask`.
2. Backend loads bounded process-local context keyed by both the authenticated user and conversation ID, then includes the prior active topic and recent turns in follow-up prompts.
3. `RagPipeline.answer()` retrieves context from Chroma, invokes the LLM, prepares citations, and returns `{ answer, citations, conversation_id, remaining_tokens }`.

### Authenticated Ask AI

1. WordPress page template `webapp/page-ask-ai.php` requires a logged-in user with `edit_posts`.
2. It calls `pathway_rag_mint_current_user_token(600)` and embeds the hosted chat app in an iframe with API, token, expiry, required-capability, and WordPress access-page parameters.
3. React validates the token shape, expiry, and configured capability for hosted-chat navigation, then uses `POST /api/ask`; the backend remains the authority for signature and authorization validation.
4. Backend validates an HS256 JWT on `/api/ask` using `PATHWAY_RAG_JWT_SECRET` and the required capability from `JWT_REQUIRED_CAP` (default `edit_posts`).
5. Dashboard upload and reload additionally require `JWT_DASHBOARD_CAP` (default `manage_rag`), so a normal WordPress token cannot mutate the document index.
6. `chat.pathway.training` redirects missing, expired, malformed, incompatible-capability, HTTP 401, and HTTP 403 sessions to the configured Pathway WordPress access page.

### File Upload / Reload

- `POST /api/upload` saves an uploaded file to `DOCS_DIR`, enforces `MAX_UPLOAD_MB` (default 50), then calls `PIPE.reload()`.
- `PIPE.reload()` now synchronizes incrementally: it fingerprints files, adds new files, replaces changed files, removes deleted files, and skips unchanged files.
- Existing legacy chunks have no fingerprint metadata, so the first reload after this change performs a one-time migration re-index.
- PDF loading uses embedded text first and applies OCR only to pages below `PDF_OCR_MIN_TEXT_CHARS`.
- Scanned PDF OCR defaults to `auto`: it uses Tesseract when available and otherwise falls back to the locked RapidOCR ONNX engine.
- OCR settings are included in PDF index metadata, so existing PDFs are reprocessed once after this feature is deployed and again whenever OCR settings change.
- `POST /api/upload` and `POST /api/reload` require a JWT containing both `JWT_REQUIRED_CAP` and `JWT_DASHBOARD_CAP`.
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
- `webapp/src/api.ts`: Older/minimal authenticated helper for `/api/ask`; `App.tsx` currently uses its own inline `askRag`.
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
- `POST /api/ask`: authenticated chat endpoint with history support.
- `GET /api/files/{name}`: authenticated file access using a bearer token or citation `token` query parameter.
- `POST /api/upload`: dashboard-authorized upload and re-index.
- `POST /api/reload`: dashboard-authorized index reload.

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

The old exact-string live/local toggle definitions remain for future deployment work, but the dashboard no longer invokes them while remote mode is locked. Dashboard SSH deployment values are loaded from `dashboard/.env` or process environment; the public host is not stored in source.

## Backend/RAG Behavior Notes

- `RagPipeline.from_disk()` builds Chroma if missing/empty; otherwise opens persisted index.
- Supported source files: `.md`, `.txt`, `.html`, `.pdf`.
- Text PDFs are read directly; image-only scanned PDF pages are rendered with PyMuPDF and recognized with Tesseract or the locked RapidOCR fallback.
- OCR is configurable with `PDF_OCR_ENABLED`, `PDF_OCR_ENGINE`, `PDF_OCR_MIN_TEXT_CHARS`, `PDF_OCR_DPI`, `PDF_OCR_LANGUAGE`, and optional `TESSERACT_CMD`.
- Chunking is content-aware and configurable with `CHUNK_MIN_SIZE`, `CHUNK_MAX_SIZE`, and `CHUNK_OVERLAP`; legacy `CHUNK_SIZE` remains the maximum-size fallback.
- Changing chunk-size settings causes affected files to be re-indexed even when their contents are unchanged.
- `CHAT_QUERY_MAX_LENGTH` rejects oversized `/api/ask` requests before retrieval.
- `CHAT_RATE_LIMIT_REQUESTS` and `CHAT_RATE_LIMIT_WINDOW_SECONDS` provide process-local per-client limits; setting requests to `0` disables the limiter.
- `CHAT_TRUST_PROXY` is disabled by default. Enable it only behind a trusted proxy that replaces `X-Forwarded-For`.
- `LLM_PROVIDER=openai` by default; Ollama support exists.
- OpenAI defaults: `gpt-4o-mini`, `text-embedding-3-small`.
- Citation URLs use `API_BASE` and default to `http://localhost:8000/api/files/{filename}` for the current local-only dashboard; page fragments are preserved where possible.
- Adjacent-page expansion skips documents such as `.txt`, `.md`, and `.html` files when they do not have numeric page metadata.
- `prompt.txt` is loaded fresh inside `RagPipeline.answer()` for each query.
- The backend conversation store is process-local and not durable, but it is isolated by authenticated user plus conversation ID and bounded by `CHAT_SERVER_HISTORY_MESSAGES` and `CHAT_MAX_SERVER_CONVERSATIONS`.
- Successful server turns are used when frontend history is absent. The latest prior user message is supplied as the active topic, and all added context counts toward input and daily token limits.
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
- The composer displays the backend-provided daily `remaining_tokens` balance after successful answers and shows a dedicated quota message when the backend rejects a reservation.
- Authentication checking and backend response waiting use separate blocking overlays.
- Request failures use a dismissible notification dialog; authorization failures explain the redirect and provide an immediate login action.
- The nuke button clears only browser/session conversation state after explicit confirmation. It does not reset daily token usage or invoke backend summarization/deletion.

## Known Issues / Risks

- Several files contain mojibake/encoding artifacts for punctuation and icons. Avoid broad formatting rewrites unless the task is specifically to fix encoding.
- `rag-backend/package.json` is empty even though `package-lock.json` and `node_modules` exist.
- `rag-backend/README.md` is empty; top-level `README.md` has the useful setup docs.
- `App.tsx` duplicates API helper logic instead of using `webapp/src/api.ts`.
- Dashboard deployment details are local configuration, but the remote SSH routes and exact text toggle patterns remain disabled legacy code pending deployment approval.
- Dashboard git commands may fail unless Git safe-directory ownership is configured for the current user.
- Dashboard local deletion removes the local file and calls authenticated backend `/api/reload`; remote deletion remains locked.
- If local deletion cannot reload the backend index, the dashboard restores the original source file.
- Uploads accept `.txt`, `.md`, `.html`, and `.pdf`; unsupported types return HTTP 400.
- Uploads use a temporary file and atomic replacement so oversized same-name uploads preserve the existing document.
- `/api/upload` and `/api/reload` require both normal and dashboard JWT capabilities, and the local dashboard generates a short-lived token using the configured secret or its process-local fallback.
- `/api/ask` is the only chatbot endpoint and requires a valid WordPress JWT containing `JWT_REQUIRED_CAP`; `/api/chat` returns HTTP 404.
- `CHAT_INPUT_TOKEN_LIMIT` rejects an estimated question-plus-recent-history input before retrieval or LLM execution.
- `LLM_MAX_OUTPUT_TOKENS` caps response generation for OpenAI (`max_tokens`) and Ollama (`num_predict`).
- `CHAT_DAILY_TOKEN_LIMIT` provides a durable daily budget per stable JWT identity.
- `JWT_USER_ID_CLAIMS` defines the ordered JWT claims used to identify the quota owner; the first non-empty value is used.
- `TOKEN_USAGE_DB` defaults to `./data/token_usage.sqlite3`; SQLite WAL mode and immediate transactions provide atomic reservations across workers on one server.
- JWT user identifiers are HMAC-SHA256 keyed with the backend JWT secret before storage, so raw WordPress IDs are not written to the quota database.
- `/api/ask` reserves estimated input plus maximum output before model execution, settles estimated input plus returned-answer usage afterward, and returns `remaining_tokens`.
- Failed requests release their reservation, and quota buckets reset by UTC date.
- The daily balance measures estimated user-visible tokens, not exact provider billing tokens; hidden system instructions and retrieved RAG context are not currently included.
- The webapp displays the matching estimated input budget and disables Send when the estimate exceeds its configured limit.
- Citation normalization preserves `#page=N` after the encoded filename, including fallback `file://` and raw-filename citations.
- The rate limiter is process-local, so each worker has a separate request bucket; a shared store is still required before scaling to multiple workers.
- The request-rate limiter remains short-window and IP-based; the daily token quota is separately keyed by JWT user identity.
- Daily token accounting survives restarts and is shared across workers that use the same SQLite path. A network database would still be required if the backend is later spread across multiple servers.
- The repository does not include the WordPress token issuer, so the deployed token must be checked for one configured stable identity claim before release.
- The webapp npm toolchain is locked to audited versions including Vite 6.4.3, Rollup 4.61.1, Picomatch 4.0.4, and PostCSS 8.5.15.
- The separate three pending Ubuntu ESM Apps operating-system updates have not been applied on EC2.
- Real `.env`, vector store, docs, node_modules, and generated files exist locally; avoid committing secrets or generated state.
- Production EC2 is deployed from branch `Sal` at commit `f60e63f`, which includes indexing/OCR commit `4a82300`.
- Production PM2 runs `rag-backend/.venv-release-test/bin/python` with Uvicorn on port 8000.
- Production `.env` must define `API_BASE=https://api.chat.pathway.training` so citation links remain public.
- The production root filesystem is only 6.8 GB. Cleanup recovered temporary test space but cannot provide enough headroom for 500+ source documents and a growing Chroma index.
- Before significant document growth, expand the root EBS volume to at least 20 GB. A cleaner alternative is a dedicated expandable EBS data volume with `DOCS_DIR`, `CHROMA_DIR`, and optionally `TOKEN_USAGE_DB` pointed at mounted paths.
- Moving source documents to object storage or replacing Chroma with a managed vector database can reduce local disk use later, but both require broader application and operational changes and are not the preferred immediate fix.
- Existing malformed PDFs can emit `Ignoring wrong pointing object` warnings during parsing; release testing confirmed these warnings do not prevent indexing.
- The rollback snapshot is under `/home/ubuntu/pathway-backups/20260606-063636`, and the pre-release Git rollback commit is `092f05c`.
- A byte-identical local copy is stored under the Git-ignored `local-backups/ec2/20260606-063636` directory. All 90 files were SHA-256 verified on 2026-06-06.
- `webapp/page-ask-ai.php` consumes `pathway_rag_mint_current_user_token()`, but the WordPress plugin that defines that function is managed outside this repository and must be verified in the deployed WordPress environment.
- The current WordPress page and backend require `edit_posts`. Subscriber access must not be enabled until the external issuer is confirmed to mint an accepted capability for the intended subscriber accounts.
- Hosted-chat redirect destinations are limited to HTTPS Pathway domains and local development hosts to avoid an open redirect.

## Production Release Status

The backend release was validated and deployed on 2026-06-06.

- Copied-production staging migration passed.
- First migration took approximately 60 seconds.
- Unchanged reloads complete in approximately 0.64 seconds.
- Native PDF ingestion and RapidOCR scanned-PDF ingestion passed.
- Same-name file replacement removed stale indexed content.
- Realistic document retrieval returned the correct answer and citation.
- JWT rejection and authorization behavior passed.
- Production and public HTTPS health checks returned HTTP 200.
- Production Chroma was approximately 189 MB after migration.

## Verification Guidance

When changing frontend:

- Run `cd webapp && npm run build` to verify TypeScript/Vite and refresh `plugin/dist`.
- Run `cd webapp && npm run test:frontend-security` for the headless Chrome redirect, quota, and responsive-layout suite.
- Run `cd webapp && npm run test:frontend-priority8` for the 10 authorization-notification, clear-confirmation, and loading-overlay checks without repeating the earlier frontend suite.
- If testing interactively, run backend on `localhost:8000` and Vite on `localhost:5173`.
- The Vite development server exposes a loopback-only `/__rag-dev-config` endpoint that reads the ignored backend `.env`, mints an eight-hour local JWT with `sub=local-development`, and points the browser at `http://localhost:8000`.
- This local token endpoint exists only in Vite development middleware; it is not included in the production build.
- Test hosted access redirects with `requireAuth=1`; local standalone development does not redirect unless this flag is set.

When changing backend:

- Prefer a lightweight import/syntax check first.
- Run `uv run --project rag-backend python -m unittest discover -s rag-backend/tests -p "test_backend_security.py" -v` for the isolated backend security suite.
- Run the FastAPI server if env/secrets and vector index are available.
- Be aware that importing `main.py` initializes `RagPipeline.from_disk()` and may require embeddings/provider credentials.

When changing dashboard:

- Run `cd dashboard && npm start` if Node dependencies exist.
- Run `cd dashboard && npm run test:security` for deployment configuration and dashboard-token checks.
- Test local-only routes before remote SSH operations.
- Remote docs/prompt/server actions require the PEM path and network access.

When changing WordPress/plugin behavior:

- Build the webapp so `plugin/dist/assets/main.js` and `styles.css` are refreshed.
- Confirm `RAG_CHATBOT_API_BASE` and optional `RAG_CHATBOT_DEV_SERVER` behavior.
- For authenticated Ask AI, confirm the token minting function exists in the active WordPress environment.
- Confirm the deployed token's capability claim for both contributor and intended subscriber accounts before broadening the page-template role check.

## Preferred Change Style

- Keep changes narrow and production-safe.
- Reuse existing files/patterns.
- Do not add dependencies unless clearly necessary.
- Do not reformat large files casually; encoding artifacts make noisy diffs likely.
- Update this notice when discovering project facts that future Codex runs should remember.
