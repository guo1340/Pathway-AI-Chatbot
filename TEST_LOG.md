# Test Log

Detailed execution record for the test procedures documented in `LOG.md`.

## 2026-06-05 21:27:35 +08:00 - Priority 1 Backend and PDF Verification

Environment:

- Windows PowerShell
- Workspace-local Python 3.12 test environment
- Dependencies synchronized from `rag-backend/uv.lock`
- Temporary document and Chroma directories
- Deterministic local embeddings; no OpenAI requests
- Synthetic native-text, image-only, and mixed PDFs
- JWT-authenticated FastAPI requests through `TestClient`

Code change required during testing:

- The workstation did not have a usable Tesseract executable.
- Added locked RapidOCR support and `PDF_OCR_ENGINE=auto`, which prefers Tesseract and falls back to RapidOCR.
- Explicit `PDF_OCR_ENGINE=tesseract` still fails clearly when Tesseract is unavailable.

Results:

- [x] Chunking 1A - Valid minimum, maximum, and overlap configuration is accepted.
- [x] Chunking 1B - Invalid chunk configuration fails before indexing.
- [x] Chunking 2 - Chunks respect configured sizes and favor content boundaries.
- [x] Chunking 3 - A chunk configuration change invalidates and replaces the affected index.
- [x] Incremental 1 - Legacy chunks migrate once and remain available until replacements are added.
- [x] Incremental 2 - Adding a document embeds only the new document.
- [x] Incremental 3 - Updating a document replaces its chunks without re-embedding unrelated files.
- [x] Incremental 4 - Deleting a document removes only its indexed chunks.
- [x] Incremental 5 - An unchanged reload makes no embedding calls.
- [x] PDF 1 - Native selectable-text PDFs bypass OCR.
- [x] PDF 2 - Image-only scanned PDFs are rendered, recognized by RapidOCR, chunked, and indexed.
- [x] PDF 3 - Mixed PDFs use native extraction for text pages and OCR only for scanned pages.
- [x] PDF 4 - Explicit Tesseract mode reports a clear error when the executable is missing.
- [x] API reload - `POST /api/reload` rejects missing authentication and accepts a valid dashboard JWT.
- [x] API native PDF upload - Authenticated upload indexes the new PDF without replacing unchanged chunks.
- [x] API scanned PDF upload - Authenticated upload recognizes and indexes scanned content through RapidOCR.
- [x] API failure safety - A failed scanned-PDF upload leaves the existing index intact.

Summary:

- Passed: 17
- Failed: 0
- Production documents modified: 0
- Production Chroma index modified: 0
- External embedding or LLM calls: 0

Additional verification:

- [x] `rag.py` and `main.py` compile under Python 3.12.
- [x] The dependency lock is current.
- [x] `git diff --check` reports no whitespace errors.

## 2026-06-05 22:01:25 +08:00 - Sal Branch Pre-Push Checks

- [x] `rag-backend/context.txt` was cleared of generated conversation/debug content.
- [x] `rag-backend/prompt.txt` contains the newer `main` branch prompt.
- [x] Backend Python modules compile successfully.
- [x] Frontend TypeScript and Vite production compilation succeeds.
- [x] Dashboard JavaScript passes Node syntax validation.
- [x] WordPress PHP files pass PHP lint.
- [x] `uv.lock` resolves successfully against `pyproject.toml`.
- [x] Intended commit files contain no real API keys, JWT secrets, private keys, or passwords.
- [x] `.env`, source documents, Chroma data, frontend build output, and crash dumps are excluded from staging.

Notes:

- The repository's combined `npm run build` command still uses Unix `cp`, so the Vite compilation was run directly on Windows with `npx vite build`.
- EC2 deployment smoke tests remain separate because they require the production Linux environment, credentials, and copied Chroma data.

## 2026-06-05 23:29:17 +08:00 - Full LOG.md Regression Run

Environment:

- Synchronized workspace-local Python 3.12 environment from `uv.lock`.
- Temporary document and Chroma directories for backend tests.
- Deterministic local embeddings and a stub LLM for isolated checks.
- Real RapidOCR for generated scanned and mixed PDFs.
- Live local dashboard, backend, frontend, Chroma index, and one disposable text document for the dashboard workflow.

Backend and API results:

- [x] Chunking 1A - Valid minimum, maximum, and overlap configuration is accepted.
- [x] Chunking 1B - Invalid chunk configuration fails before indexing.
- [x] Chunking 2 - Chunks respect configured sizes and content boundaries.
- [x] Chunking 3 - A chunk configuration change invalidates affected indexes.
- [x] Incremental 1 - Legacy chunks migrate once.
- [x] Incremental 2 - Adding a document embeds only the new document.
- [x] Incremental 3 - Updating a document does not re-embed unrelated files.
- [x] Incremental 4 - Deleting a document removes only its chunks.
- [x] Incremental 5 - An unchanged reload makes no embedding calls.
- [x] PDF 1 - Native selectable-text PDFs bypass OCR.
- [x] PDF 2 - Image-only PDFs are recognized by RapidOCR.
- [x] PDF 3 - Mixed PDFs use OCR only on scanned pages.
- [x] PDF 4 - Missing explicit Tesseract reports a clear error.
- [x] API reload - Missing auth is rejected and a valid dashboard JWT succeeds.
- [x] API native PDF upload - Authenticated upload indexes incrementally.
- [x] API scanned PDF upload - Authenticated upload indexes OCR content.
- [x] API failure safety - Failed OCR preserves the existing index.
- [x] Retrieval regression - Text documents without page metadata no longer crash adjacent-page expansion.

Dashboard results:

- [x] Dashboard root and status route load in local-only mode.
- [x] Backend and frontend launch independently and become healthy.
- [x] Repeated launch requests do not start duplicate tracked processes.
- [x] Local upload reaches authenticated backend `/api/upload`.
- [x] Uploaded document appears in the dashboard list and local docs directory.
- [x] Chat retrieval returns the disposable document's unique phrase and citation.
- [x] Citation URL uses the local backend by default.
- [x] Dashboard deletion removes the source file and its Chroma chunks.
- [x] Remote toggle, prompt sync, and restart routes return HTTP 423.
- [x] Dialog opens and closes through Understood, `x`, backdrop click, and Escape.

Failures found and corrected:

- The ignored local `.env` used the invalid model name `gpt-40-mini`; corrected it to `gpt-4o-mini`.
- Text-document retrieval raised a `TypeError` because adjacent-page expansion attempted arithmetic on `page=None`; fixed it to use numeric pages only.
- Local citations defaulted to the undeployed remote API; changed the default `API_BASE` to `http://localhost:8000` while preserving environment override support.

Release checks:

- [x] `rag.py` and `main.py` compile under Python 3.12.
- [x] `uv lock --check` passes.
- [x] Vite production build passes through `npm.cmd exec vite build`.
- [x] Dashboard server and inline browser JavaScript parse successfully.
- [x] WordPress PHP lint passes.
- [x] `git diff --check` reports no whitespace errors.
- [x] Disposable dashboard source and indexed chunks were removed.

Notes:

- The in-app browser could not start in the Windows sandbox. The actual dialog source was executed with a mocked DOM to verify all four dismissal paths, and the remote routes were tested over HTTP.
- The first frontend build command invoked blocked `npm.ps1`; rerunning through `npm.cmd` passed without a code change.
- Final result: 18 backend/API checks, 10 dashboard checks, and 7 release checks passed.

## 2026-06-06 00:21:45 +08:00 - Dashboard Pre-Push Edge Verification

Deletion failure recovery:

- [x] With the backend stopped, dashboard deletion returns HTTP 500.
- [x] The deleted source file is restored with its original content when index reload cannot run.
- [x] With the backend running, deletion succeeds and removes the source and its Chroma chunks.

Browser and responsive UI:

- [x] Headless Chrome desktop rendering at 1440 x 1100 shows the dashboard without overlap.
- [x] Chrome device emulation at 390 x 844 reports `innerWidth=390` and `scrollWidth=390`.
- [x] The remote-lock modal is visible and fully contained within the mobile viewport.
- [x] The document dropzone is fully contained within the mobile viewport.
- [x] The Version Control section is absent from the rendered page.
- [x] Dashboard server and inline scripts parse successfully.

Prompt round trip:

- [x] Prompt content can be saved and read back through dashboard APIs.
- [x] The test marker was removed and `prompt.txt` was restored to a zero Git diff.
- [x] No prompt test marker remains.

Upload edge cases:

- [x] Upload while the backend is stopped fails without adding a document.
- [x] Multiple supported files upload successfully.
- [x] A duplicate filename replaces and re-indexes the existing document.
- [x] Unsupported `.csv` upload returns HTTP 400 and is not retained.
- [x] Oversized upload returns HTTP 413.
- [x] An oversized same-name replacement preserves the original document.
- [x] Partial `.upload-*.tmp` files are removed.
- [x] All test documents and Chroma chunks were removed afterward.

Changes required by failed tests:

- Restored source files when dashboard-triggered reload fails during deletion.
- Added backend validation for `.txt`, `.md`, `.html`, and `.pdf` uploads.
- Changed uploads to write a temporary file before atomically replacing the destination.
- Preserved backend HTTP error status through the dashboard proxy.
- Added the supported-extension filter to the dashboard file picker.
- Fixed mobile horizontal overflow in service, log, document, and dropzone layouts.
- Removed the Version Control card, client functions, server endpoints, and unused process helper.

Release checks:

- [x] Backend Python compilation passes.
- [x] Dashboard JavaScript parsing passes.
- [x] Vite production build passes.
- [x] `git diff --check` passes.

## 2026-06-06 16:56:46 +08:00 - EC2 Release Verification

Environment:

- Branch: `Sal`
- Release commit: `f60e63f`
- Included indexing/OCR commit: `4a82300`
- Rollback commit: `092f05c`
- Python: 3.12.3
- Staging API: `127.0.0.1:8001`
- Production API: `127.0.0.1:8000`
- Public API: `https://api.chat.pathway.training`

Backup and installation:

- [x] Production documents were backed up.
- [x] Production Chroma store was backed up.
- [x] Production `.env`, prompt, rollback commit, and PM2 configuration were preserved.
- [x] `uv sync --frozen` installed all locked dependencies.
- [x] PyMuPDF, pytesseract, RapidOCR, ONNX Runtime, and Chroma imported successfully.
- [x] `main.py` and `rag.py` compiled successfully.

Staging results:

- [x] Health endpoint returned HTTP 200.
- [x] Missing JWT returned HTTP 401.
- [x] Invalid JWT returned HTTP 401.
- [x] Valid JWT authorized reload and upload operations.
- [x] First copied-index migration returned HTTP 200 in approximately 60.4 seconds.
- [x] Second unchanged reload returned HTTP 200 in approximately 0.64 seconds.
- [x] Public chat returned relevant document-backed answers.
- [x] Authenticated ask returned relevant answers and citations.
- [x] Citation URLs used `https://api.chat.pathway.training/api/files/`.
- [x] Native PDF upload stored the exact selectable text in Chroma.
- [x] Scanned PDF upload stored OCR text with RapidOCR metadata.
- [x] Same-name document replacement retained only the new content.
- [x] Unsupported `.exe` upload returned HTTP 400.
- [x] No partial `.upload-*.tmp` files remained.
- [x] A realistic mentoring-policy question returned the expected answer and source citation.
- [x] Disposable staging documents and index entries were removed.

Retrieval note:

- Artificial phrases such as `silver harbor 4821` were confirmed in Chroma but did not always rank in the chatbot's default top results among the larger document corpus.
- Direct index inspection proved native and OCR ingestion, while the realistic ministry-policy test proved the complete retrieval and answer flow.

Production results:

- [x] PM2 uses `.venv-release-test/bin/python`.
- [x] PM2 status remained online after cutover.
- [x] Production authenticated reload returned HTTP 200.
- [x] Production unchanged reload completed in approximately 0.64 seconds.
- [x] Public HTTPS health returned HTTP 200.
- [x] Production Chroma remained available at approximately 189 MB.
- [x] PM2 logs showed no startup, import, authentication, Chroma, OpenAI, or OCR failures.

Infrastructure observation:

- [x] Disk usage was investigated after release.
- The root filesystem is 6.8 GB and remains undersized for production growth.
- The active release environment is approximately 721 MB.
- VS Code Server is approximately 844 MB.
- Production Chroma and documents total approximately 249 MB.
- The retained rollback backup is approximately 232 MB.

Local backup verification:

- [x] EC2 release backup downloaded to a Git-ignored local directory.
- [x] Remote file count: 90.
- [x] Local file count: 90.
- [x] Missing files: 0.
- [x] Extra files: 0.
- [x] SHA-256 mismatches: 0.
- [x] Raw EC2 test transcript preserved locally.

## Priority 2 Backend Security Verification

Executed on 2026-06-06 using an isolated stub RAG pipeline, temporary document directory, FastAPI `TestClient`, and an instrumented dashboard configuration runtime. No proprietary documents, Chroma data, OpenAI requests, or production services were used.

### Dashboard-only upload and reload authorization

- [x] A missing bearer token returns HTTP 401 from `/api/upload` and `/api/reload`.
- [x] A valid token containing only `JWT_REQUIRED_CAP` returns HTTP 403 from `/api/upload` and `/api/reload`.
- [x] A valid token containing both `JWT_REQUIRED_CAP` and `JWT_DASHBOARD_CAP` can reload the index.
- [x] A valid dashboard token can upload a supported temporary document and the cleanup reload succeeds.
- [x] A normal WordPress token can still use `/api/ask` but cannot upload or reload documents.

Optimal result: normal authenticated chat remains available while index-changing endpoints accept only dashboard-authorized tokens.

### Query length validation

- [x] A query exactly `CHAT_QUERY_MAX_LENGTH` characters long reaches the endpoint handler.
- [x] A query over the configured limit returns HTTP 422.
- [x] An oversized query does not call retrieval or the LLM.
- [x] A zero or negative `CHAT_QUERY_MAX_LENGTH` value prevents backend startup with a clear configuration error.

Optimal result: oversized requests fail during request validation and consume no retrieval or model resources.

### Chat rate limiting

- [x] The configured number of `/api/chat` requests succeeds and the next request returns HTTP 429 with `Retry-After`.
- [x] `/api/ask` uses the same limiter behavior after JWT validation.
- [x] Separate client addresses receive separate request buckets.
- [x] Requests succeed again after the configured window expires.
- [x] `CHAT_RATE_LIMIT_REQUESTS=0` disables rate limiting.
- [x] Invalid active rate-limit values prevent backend startup with a clear configuration error.
- [x] With `CHAT_TRUST_PROXY=false`, a spoofed `X-Forwarded-For` value does not create a new client bucket.
- [x] With `CHAT_TRUST_PROXY=true`, trusted proxy client addresses are separated using the first `X-Forwarded-For` value.

Optimal result: abusive clients receive HTTP 429 without allowing untrusted forwarding headers to bypass the limit.

### Protected document access

- [x] Missing and invalid tokens return HTTP 401 from `/api/files/{name}`.
- [x] A valid bearer token returns the requested document.
- [x] A valid citation `token` query parameter returns the requested document.
- [x] Expired or insufficient-capability tokens are rejected.
- [x] Filename traversal attempts remain rejected.

Optimal result: authenticated citations work, while guessed filenames and traversal attempts cannot expose documents.

### Dashboard deployment configuration

- [x] No public EC2 hostname is present in tracked dashboard source.
- [x] `dashboard/.env` values load when matching process environment variables are absent.
- [x] Existing process environment variables take precedence over `dashboard/.env`.
- [x] Missing remote host configuration produces a clear remote-operation error.
- [x] The dashboard-generated local token contains both configured backend and dashboard capabilities.

Optimal result: coworker-specific deployment values stay local and local dashboard document management remains compatible with backend authorization.

Execution summary:

- [x] Backend security suite: 6 test groups passed in 4.573 seconds on the final rerun.
- [x] Dashboard security configuration suite: 5 checks passed.
- [x] Backend and test Python files compile.
- [x] Dashboard server and security test JavaScript parse.
- [x] No application-code changes were required after the behavioral tests.

## 2026-06-07 10:50:38 +08:00 - Final Local Security Release Gate

The existing security tests were rerun from the current working tree before beginning the online deployment checks.

Local results:

- [x] Full backend test discovery ran all 6 security test groups successfully in 4.850 seconds.
- [x] Dashboard security configuration suite passed all 5 checks.
- [x] Backend application and security test files compile with Python 3.12.11.
- [x] Dashboard server and security test files pass Node.js syntax checks.
- [x] Frontend TypeScript and Vite production build completed successfully.
- [x] `git diff --check` found no whitespace errors.
- [x] Source review confirmed authenticated frontend citations append the JWT query parameter before a PDF page fragment.
- [x] Source review confirmed active local dashboard upload and deletion routes use authenticated backend calls.

Additional online checks still required:

- [x] Local PHP syntax and source wiring confirm the Ask AI page requests a 10-minute JWT and passes it to the iframe. The token-minting plugin is external to this repository, so live minting remains an online check.
- [x] Earlier local API tests confirmed public `/api/chat` citations contained no token and protected files returned HTTP 401 without one. This behavior was superseded on 2026-06-07 when `/api/chat` itself became JWT-protected.
- [x] Local production-origin CORS simulation allows `https://chat.pathway.training` and rejects an unapproved origin.
- [x] Local forwarded-client tests confirm `CHAT_TRUST_PROXY=false` ignores spoofed forwarding headers and `true` uses the first forwarded address.
- [x] Local dashboard tests confirm the remote-action middleware returns HTTP 423 without continuing to SSH logic.
- [x] Authenticated PDF citation regression confirms the query token is placed before `#page=N`, the file returns HTTP 200 inline, and the page fragment remains intact.
- [ ] Confirm the deployed WordPress token-minting plugin returns a JWT accepted by `/api/ask`, then open an authenticated PDF citation at the cited page.
- [ ] Decide whether public `/api/chat` should omit citations, require login, or continue returning protected citation references.
- [ ] Verify rate-limit client identity through Nginx. With `CHAT_TRUST_PROXY=false`, proxied requests may share the Nginx address; enable trusted forwarding only after confirming port 8000 is not publicly reachable and Nginx overwrites forwarding headers.
- [ ] Confirm PM2 runs the expected single backend process. The current rate limiter is process-local, so multiple workers have independent limits.
- [ ] Verify production CORS over public HTTPS allows the approved frontend and WordPress origins and rejects an unapproved origin.
- [ ] Repeat health, missing/invalid JWT, dashboard JWT reload, query-length, HTTP 429, protected-file, chat, and citation smoke tests over public HTTPS.
- [x] Keep remote dashboard controls locked. Its legacy SSH restart/reload path is outside this backend release and must be replaced or authenticated before live controls are re-enabled.

Optimal result: every local gate remains green, public HTTPS preserves the same authorization behavior, and Nginx identifies clients without trusting user-supplied forwarding headers.

## 2026-06-07 10:57:33 +08:00 - Pre-EC2 Unchecked Test Run

Executed all remaining deployment-independent checks from the current working tree.

Results:

- [x] Backend security suite expanded from 6 to 7 test groups and passed in 4.306 seconds on the final rerun.
- [x] Dashboard security suite expanded from 5 to 6 checks and passed.
- [x] Production CORS-origin simulation passed for an approved and an unapproved origin.
- [x] The earlier public citation behavior was reproduced before `/api/chat` was changed to require WordPress authentication.
- [x] Authenticated PDF citation access returned HTTP 200 with inline PDF headers.
- [x] Forwarded-client rate-limit behavior remained covered for trusted and untrusted proxy modes.
- [x] Remote dashboard middleware returned HTTP 423 and did not continue to the protected action.
- [x] WordPress page PHP syntax passed and its iframe token wiring was confirmed by source inspection.
- [x] Frontend Vite production build passed.
- [x] Backend Python, dashboard JavaScript, and WordPress PHP syntax checks passed.
- [x] `git diff --check` passed.

Failed-first regression:

- [x] The new PDF citation test initially returned HTTP 404 because a `file://...pdf#page=N` fragment was percent-encoded as part of the filename.
- [x] Citation normalization now separates the fragment before quoting the filename and restores it after the file path.
- [x] The full backend suite passed after the fix.

Environment limitations:

- PM2 and Nginx are not installed in the Windows test environment.
- The WordPress token-minting plugin is not stored in this repository.
- Public HTTPS cannot validate the new working tree until the release is staged on EC2.

Optimal result: all locally reproducible release behavior passes, and the remaining unchecked items are limited to the actual EC2/Nginx/PM2/WordPress deployment.

## 2026-06-07 11:21:57 +08:00 - Backend WordPress Authentication Boundary

Changed `/api/chat` to require the same normal WordPress JWT capability as `/api/ask`.

Results:

- [x] Missing JWT returns HTTP 401 from `/api/chat`.
- [x] Malformed JWT returns HTTP 401 from `/api/chat`.
- [x] A valid JWT without `JWT_REQUIRED_CAP` returns HTTP 403.
- [x] Unauthorized requests do not call retrieval or the LLM.
- [x] A valid normal WordPress JWT can call `/api/chat`.
- [x] Query-length, rate-limit, CORS, authenticated citation, document access, and dashboard authorization tests still pass.
- [x] Full backend suite: 8 test groups passed in 4.890 seconds.
- [x] Frontend TypeScript/Vite production build passed.
- [x] Backend Python and WordPress PHP syntax checks passed.
- [x] `git diff --check` passed.

Remaining frontend behavior:

- [ ] Redirect tokenless, expired-token, and incompatible-role visitors to the Pathway login/access page.

Remaining usage-control behavior:

- [x] Moved per-user daily limits to durable SQLite storage.
- [ ] Confirm the deployed WordPress JWT identity claim during EC2 staging.

Optimal result: direct access to `chat.pathway.training` cannot obtain an AI answer without an accepted WordPress JWT, even if the frontend redirect is bypassed.

## 2026-06-07 12:25:42 +08:00 - Single Chat Endpoint and Token Ceilings

Removed `/api/chat` and retained authenticated `/api/ask` as the only chatbot endpoint.

Backend results:

- [x] `/api/chat` returns HTTP 404.
- [x] `/api/ask` rejects missing, malformed, and insufficient-capability JWTs.
- [x] Valid WordPress JWTs can use `/api/ask`.
- [x] Estimated input tokens include the current question and up to six recent frontend messages.
- [x] A request at the configured input-token limit succeeds.
- [x] A request above the input-token limit returns HTTP 422 before retrieval or LLM execution.
- [x] Recent history can push a request over the input-token ceiling.
- [x] Invalid `CHAT_INPUT_TOKEN_LIMIT` configuration prevents startup.
- [x] OpenAI accepts the configured 1,200-token `max_tokens` ceiling.
- [x] Ollama accepts the configured 1,200-token `num_predict` ceiling.

Frontend results:

- [x] All requests target authenticated `/api/ask`.
- [x] The input estimate uses the same UTF-8 byte estimate as the backend.
- [x] The estimate includes the same six recent messages sent to the backend.
- [x] The composer displays estimated input tokens and the maximum response budget.
- [x] Send is disabled without a JWT or when the estimate exceeds the configured limit.
- [x] Vite production build passed.

Regression results:

- [x] Full backend suite: 9 test groups passed in 5.591 seconds on the final rerun.
- [x] Dashboard security suite: 6 checks passed.
- [x] Python compilation passed.
- [x] `git diff --check` passed.
- [ ] Browser screenshot verification was unavailable because the in-app browser could not start in this Windows session. Manual preview is available at `http://127.0.0.1:5173/`.

Failed-first note:

- The first backend run caught an indentation error caused by placing the estimator before the rate-limit stale-bucket cleanup block.
- The cleanup block was restored inside the rate-limit lock and every backend test passed afterward.

Daily quota follow-up:

- [x] Durable SQLite accounting is implemented and tested across reinitialization and concurrent connections.
- [ ] Confirm which configured stable identity claim is present in the deployed WordPress JWT.

Optimal result: every chatbot request is authenticated, oversized requests are stopped in the browser and independently rejected by the backend, and model responses cannot exceed the configured generation ceiling.

## 2026-06-07 12:54:33 +08:00 - Remaining User Token Response

Added process-local daily per-user token accounting to authenticated `/api/ask`.

Response contract:

- [x] Every successful answer includes integer `remaining_tokens`.
- [x] The balance starts from configurable `CHAT_DAILY_TOKEN_LIMIT`.
- [x] Usage is keyed by the first non-empty configured JWT identity claim.
- [x] The default claim order is `sub`, `user_id`, then `id`.

Accounting behavior:

- [x] Estimated question plus recent-history tokens are reserved together with `LLM_MAX_OUTPUT_TOKENS` before model execution.
- [x] A request that cannot fit within the remaining reservation budget returns HTTP 429 before RAG execution.
- [x] Successful requests settle estimated question/history plus returned-answer tokens.
- [x] Separate users receive separate balances.
- [x] Repeated requests decrement the same user's balance.
- [x] Missing stable user identity returns HTTP 401 before RAG execution.
- [x] Failed model or post-processing requests release their reservation.
- [x] Balances reset on the next UTC date.
- [x] Invalid daily-limit, output-limit, or identity-claim configuration prevents startup.

Scope:

- The balance represents estimated user-visible input and output tokens.
- It is not exact OpenAI billing usage because hidden system instructions and retrieved document context are not included.
- Accounting is stored in SQLite and survives backend restart.

Verification:

- [x] Full backend suite: 11 groups passed in 8.646 seconds on the final rerun.
- [x] Dashboard security suite: 6 checks passed.
- [x] Frontend production build passed after stopping the active Vite preview process.
- [x] Python, JavaScript, and PHP syntax checks passed.
- [x] `git diff --check` passed.

Pending frontend work:

- [ ] Display `remaining_tokens` after each successful response.
- [ ] Present a clear exhausted-balance state for HTTP 429 quota responses.

Optimal result: the frontend can reliably read a per-user remaining balance after each answer, while exhausted users are rejected before retrieval or model execution.

### Production ESM Apps security update maintenance checklist

Status: not executed. This checklist refers to Ubuntu Expanded Security Maintenance application packages on EC2, not JavaScript ES modules.

- [ ] Record the exact three Ubuntu ESM Apps package names, installed versions, target versions, and compatibility notes.
- [ ] Confirm a current EC2 snapshot or rollback backup and enough free disk space.
- [ ] Schedule and communicate a maintenance window.
- [ ] Run the Ubuntu package manager dry-run or simulation and save the output.
- [ ] Apply only the three reviewed Ubuntu ESM Apps updates.
- [ ] Reboot only when required, then confirm the PM2 `rag-backend` process is online.
- [ ] Verify public health, authenticated ask, dashboard-authorized reload, rate limiting, and protected file access.
- [ ] Record final package versions and any rollback action.

Optimal result: all reviewed updates are applied without backend, authentication, retrieval, or dashboard regressions, with a tested rollback path available.

## 2026-06-07 13:12:05 +08:00 - Durable Quota and npm Security Completion

Durable quota results:

- [x] SQLite usage database initializes automatically with WAL mode.
- [x] Usage survives database reinitialization.
- [x] Atomic `BEGIN IMMEDIATE` transactions prevent concurrent reservations from overspending one balance.
- [x] Raw WordPress user identifiers are replaced with HMAC-SHA256 user keys before storage.
- [x] Failed model and post-processing requests release reservations.
- [x] Rows older than seven days are pruned during reservations.
- [x] `rag-backend/data/` is excluded from Git.

Webapp npm dependency results:

- [x] Webapp audit initially reproduced Vite, Rollup, Picomatch, and PostCSS advisories.
- [x] `npm audit fix` applied non-breaking secured versions.
- [x] The secured `webapp/package-lock.json` is now eligible for source control.
- [x] Final audits report zero vulnerabilities for all three Node projects.
- [x] Vite 6.4.3 production build passed.

Final verification:

- [x] Backend security suite: 12 groups passed in 9.955 seconds.
- [x] Dashboard security suite: 6 checks passed.
- [x] Python, JavaScript, and PHP syntax checks passed.
- [x] `git diff --check` passed.

EC2-only remainder:

- [ ] Identify and apply the three pending Ubuntu ESM Apps updates.
- [ ] Install the secured webapp lockfile when the frontend is deployed from this release.
- [ ] Confirm the live WordPress JWT identity claim.
- [ ] Run staging and public HTTPS smoke tests before production approval.

Optimal result: quota balances survive backend restarts and remain consistent across local workers, while production installs only the reviewed zero-advisory dependency graph.

## 2026-06-07 13:28:47 +08:00 - Priority 4 Backend Completion

Server conversation-context results:

- [x] A first authenticated request stores a successful user/assistant turn.
- [x] A same-user vague follow-up with the same conversation ID includes the prior active topic.
- [x] Server context is used when frontend history is omitted.
- [x] Reusing a conversation ID under a different authenticated user does not expose the first user's context.
- [x] Contextual prompt text counts toward the input-token ceiling and daily quota.
- [x] Failed responses are not stored as completed conversation turns.
- [x] Per-conversation history is trimmed to `CHAT_SERVER_HISTORY_MESSAGES`.
- [x] Oldest conversations are evicted above `CHAT_MAX_SERVER_CONVERSATIONS`.
- [x] Invalid context bounds prevent startup.
- [x] Full backend suite: 13 groups passed in 11.812 seconds on the final rerun.
- [x] Python syntax compilation passed.

Storage assessment results:

- [x] Existing EC2 disk-usage investigation identified the 6.8 GB root filesystem as the limiting resource.
- [x] Temporary staging environments, caches, and backups were treated as cleanup targets rather than production data.
- [x] Required `docs` and `chroma_store` data were not selected for deletion.
- [x] Root EBS expansion to at least 20 GB was documented as the smallest operational fix.
- [x] A dedicated EBS data volume was documented as the practical alternative for isolating document, Chroma, and quota growth.
- [ ] Actual EBS expansion or data-volume attachment must be completed and verified on EC2.

Optimal result: vague follow-ups retain the correct topic without crossing user boundaries, process memory remains bounded, and EC2 has sustainable disk headroom before additional document indexing.

## 2026-06-07 13:42:14 +08:00 - Final Local Pre-Push Gate

Results:

- [x] Backend security and regression suite: 13 groups passed.
- [x] Dashboard security suite: 6 checks passed.
- [x] Backend Python files compiled successfully.
- [x] Dashboard JavaScript files passed syntax checks.
- [x] WordPress plugin and Ask AI page passed PHP syntax checks.
- [x] Vite 6.4.3 production compilation passed.
- [x] Generated webapp assets copied into `plugin/dist`.
- [x] Webapp npm audit: zero vulnerabilities.
- [x] Dashboard npm audit: zero vulnerabilities.
- [x] Backend Node package audit: zero vulnerabilities.
- [x] `git diff --check` passed.

Failed-first regression:

- [x] The original webapp build script failed after compilation because Windows does not provide the Unix `cp` command.
- [x] A dependency-free Node copy script replaced the platform-specific command.
- [x] The complete `npm run build` command passed after the fix.

EC2-only remainder:

- [ ] Expand the root EBS volume or attach the planned data volume.
- [ ] Apply and verify the pending Ubuntu ESM Apps updates.
- [ ] Confirm live WordPress JWT identity, Nginx forwarding, PM2 process configuration, quota persistence, protected citations, and public HTTPS behavior.

Optimal result: the pushed `Sal` commit has no known local test failures, and the remaining checks require the actual production infrastructure.
