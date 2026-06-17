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
- [x] Removed public `/api/chat`; authenticated `/api/ask` is the only deployed chatbot endpoint.
- [x] Verified Nginx client-identity configuration: Uvicorn listens only on `127.0.0.1:8000`, direct public TCP port 8000 fails, Nginx overwrites `X-Forwarded-For` with `$remote_addr`, and `CHAT_TRUST_PROXY=true`.
- [x] Confirmed PM2 runs one fork-mode `rag-backend` process and the saved process listens on `127.0.0.1:8000`.
- [x] Verified production CORS over public HTTPS: all three approved origins received matching `access-control-allow-origin` headers, while `https://attacker.example` returned HTTP 400 without that header.
- [x] Public HTTPS health returned HTTP 200.
- [x] Public HTTPS `/api/ask` without a JWT returned HTTP 401.
- [x] Public HTTPS authenticated `/api/ask` returned HTTP 200 with citations and `remaining_tokens`.
- [x] Public HTTPS conversation continuity resolved “its” to the prior ordination topic.
- [x] Public HTTPS reload returned HTTP 403 for a normal JWT and HTTP 200 for a dashboard JWT.
- [x] Public HTTPS protected PDF access returned HTTP 401 without a JWT and HTTP 200 `application/pdf` with a JWT.
- [x] Verified malformed and expired JWT rejection through public HTTPS; both returned HTTP 401 with the expected `Invalid token` and `Token expired` details.
- [ ] Verify query-length and estimated-token rejection through public HTTPS; both passed through EC2 staging on port 8001.
- [ ] Trigger and verify short-window HTTP 429 rate limiting through public HTTPS.
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

- [x] Redirect tokenless, expired-token, and incompatible-role visitors to the Pathway login/access page; the later dedicated frontend suite verified each case.

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
- [x] Later headless Chrome verification covered desktop and mobile viewport behavior after the original in-app browser attempt was unavailable.

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

- [x] Display `remaining_tokens` after each successful response.
- [x] Present clear zero-balance and nonzero-insufficient-balance states for daily quota HTTP 429 responses.

Optimal result: the frontend can reliably read a per-user remaining balance after each answer, while exhausted users are rejected before retrieval or model execution.

### Production ESM Apps security update maintenance checklist

Status: blocked pending an organization-approved Ubuntu Pro subscription. The server was confirmed unattached and no ESM package changes were made. This checklist refers to Ubuntu Expanded Security Maintenance application packages on EC2, not JavaScript ES modules.

- [x] Identified the five reported packages: `node-lodash`, `node-lodash-packages`, `python3-pip`, `python3-pip-whl`, and `python3-wheel`.
- [ ] Attach the server to Ubuntu Pro and record installed versions, visible ESM target versions, and compatibility notes.
- [x] Confirmed the retained rollback backup, created a pre-release `.env` backup, and restored approximately 1.2 GB free disk space after staging cleanup.
- [ ] Schedule and communicate a maintenance window.
- [ ] Run the Ubuntu package manager dry-run or simulation and save the output.
- [ ] Apply only the five reviewed Ubuntu ESM Apps updates.
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

- [ ] Attach Ubuntu Pro and apply the five currently reported Ubuntu ESM Apps updates.
- [ ] Install the secured webapp lockfile when the frontend is deployed from this release.
- [ ] Confirm the live WordPress JWT identity claim.
- [x] Ran EC2 staging and public HTTPS backend smoke tests before production approval; remaining CORS, genuine WordPress-role, and public rate-limit checks are tracked separately.

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
- [x] Owner confirmed the genuine live WordPress subscriber/token verification is complete in the deployed environment.
- [x] Confirmed Nginx forwarding overwrites client identity and direct public port 8000 access is closed.
- [x] Confirmed the saved PM2 process runs one backend worker bound to `127.0.0.1:8000`.
- [x] Confirmed SQLite quota persistence across an EC2 staging-process restart.
- [x] Confirmed protected citations through local production and public HTTPS.
- [x] Confirmed public HTTPS health, authentication boundary, authenticated answers, conversation continuity, dashboard reload authorization, and citation access.

Optimal result: the pushed `Sal` commit has no known local test failures, and the remaining checks require the actual production infrastructure.

## Pending Priority 3 and 5 Frontend Verification

All earlier completed checks remain marked `[x]`. The production build and PHP syntax checks below were completed during implementation; the new behavior cases remain unchecked for the next dedicated test session.

Static verification:

- [x] `npm.cmd run build` completed with Vite 6.4.3 and copied the generated assets locally.
- [x] `webapp/page-ask-ai.php` passed PHP syntax validation.

### Hosted chat access redirect

- [x] Direct access to `chat.pathway.training` without a token redirects to the configured Pathway WordPress access page without showing the chat UI.
- [x] A malformed JWT redirects before the user can submit a request.
- [x] An expired JWT redirects before the user can submit a request.
- [x] A JWT missing the configured capability redirects before the user can submit a request.
- [x] A valid unexpired JWT containing the configured capability remains in the hosted chat and can call `/api/ask`.
- [x] HTTP 401 and HTTP 403 responses from `/api/ask` redirect to the configured access page.
- [x] The ordinary WordPress site-wide widget does not redirect its containing page when hosted-chat auth mode is not enabled.
- [x] A malicious external `accessUrl` value is rejected in favor of the Pathway access-page fallback.
- [x] Localhost access URLs remain available for explicit local authentication testing.
- [x] The WordPress Ask AI template passes `requireAuth`, `requiredCap`, `accessUrl`, token, and expiry to the iframe.

Optimal result: unauthorized hosted-chat visitors return to WordPress access control, valid users remain in chat, normal embedded widgets are not redirected, and redirect parameters cannot send visitors to an unrelated site.

### Subscriber compatibility release check

- [x] Owner confirmed the external WordPress subscriber/token verification is complete.
- [x] Owner confirmed the deployed access behavior is approved and no further repository work is required for this release check.

Optimal result: intended users can use Ask AI without weakening access for unauthorized roles. The externally managed issuer verification is complete by owner confirmation.

### Remaining daily token balance

- [x] A successful `/api/ask` response displays its integer `remaining_tokens` value beside the existing input and response estimates.
- [x] A later successful response replaces the displayed balance with the newest backend value.
- [x] When estimated input plus maximum output exceeds the known remaining balance, Send is disabled and the estimate uses the warning style.
- [x] A quota HTTP 429 with zero remaining tokens displays the exhausted-daily-balance message.
- [x] A quota HTTP 429 with a nonzero insufficient balance displays the backend-provided remaining amount.
- [x] A short-window rate-limit HTTP 429 without `remaining_tokens` remains a generic server error and is not mislabeled as daily quota exhaustion.
- [x] The balance and quota message fit without overlap at desktop and mobile viewport widths.

Optimal result: users can see their latest backend balance, cannot knowingly submit a request larger than it, and can distinguish daily exhaustion from temporary rate limiting.

Execution summary, 2026-06-07 17:17:23 +08:00:

- [x] Dependency-free application mocks and headless Chrome exercised the production webapp build.
- [x] All 20 locally reproducible frontend security, quota, and localhost checks passed.
- [x] Desktop viewport: 1440 x 900.
- [x] Mobile viewport: 390 x 844.
- [x] `npm.cmd run build` passed.
- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] The added `ws` test-only development dependency left the npm audit at zero vulnerabilities.

Failed-first harness notes:

- The first run timed out because Node's built-in WebSocket client could not maintain Chrome's DevTools connection; the test harness now uses the standard test-only `ws` package.
- Chrome's GPU subprocess could not initialize in this Windows sandbox; the isolated headless test profile now disables GPU and sandbox use.
- The second balance request initially ran during the typing animation; the harness now waits for the enabled Send button.
- External fallback navigation produces Chrome's offline error page, so the open-redirect assertion now verifies the requested trusted URL through Chrome network events.

The subscriber compatibility checks above remain external-only and unchecked.

### Localhost Send regression

- [x] Vite's development-only token endpoint accepts loopback requests.
- [x] The local token contains the configured `edit_posts` capability, stable `sub=local-development` identity, and an eight-hour expiry.
- [x] The local configuration points to `http://localhost:8000` by default.
- [x] The localhost Send button becomes enabled after local authentication loads.
- [x] Clicking Send submits an authenticated request to the configured local API and displays the response balance.
- [x] The complete frontend suite now passes 20 checks.

Optimal result: starting the backend and Vite frontend locally produces a working authenticated chat without placing a development token or backend secret in tracked frontend source or production assets.

## Pending Priority 8 Frontend Interaction Verification

All previously executed frontend tests remain checked above. The locally reproducible Priority 8 cases were run on 2026-06-08; the external WordPress-account case remains pending.

### Authorization and failure notifications

- [x] Missing, malformed, expired, and insufficient-capability sessions display the correct reason before redirecting.
- [ ] A logged-in but unauthorized session is returned through the WordPress access page to the login screen with the configured explanatory message.
- [x] Backend HTTP 401 and HTTP 403 failures show the appropriate session/access message and redirect after the delay.
- [x] The `Go to login` button redirects immediately.
- [x] Generic backend failures show `Response unavailable` without exposing raw backend details.
- [x] Temporary HTTP 429 rate limits show a retry message and do not claim that daily quota is exhausted.
- [x] A non-redirecting failure dialog closes through its close icon, Understood button, backdrop click, and Escape.

Optimal result: users receive a clear, non-technical reason for failure, and only authentication-related failures navigate away.

### Clear-chat confirmation

- [x] Clicking the nuke button opens the destructive confirmation dialog without clearing messages.
- [x] Cancel closes the dialog and preserves messages.
- [x] The close icon closes the dialog and preserves messages.
- [x] Clicking the backdrop closes the dialog and preserves messages.
- [x] Escape closes the dialog and preserves messages.
- [x] Confirming clears rendered messages, the current conversation ID, draft input, quota warning, and `sessionStorage` chat history.
- [x] Confirming does not reset or hide the latest daily `remaining_tokens` balance.
- [x] The dialog states that cleared browser history cannot be recovered and token usage will not reset.

Optimal result: chat history is never cleared accidentally, while confirmed frontend clearing starts a fresh visible conversation without changing quota usage.

### Loading overlays

- [x] The authentication overlay is visible while local or hosted access is being checked.
- [x] The authentication overlay is removed after valid authentication completes.
- [x] The backend-waiting overlay appears after Send and remains visible until the response and typing sequence complete.
- [x] The waiting overlay prevents duplicate sends while the request is active.
- [x] Both overlays expose an accessible live status and fit desktop and mobile viewports without overflow.

Optimal result: users always understand whether the app is checking access or waiting for an answer, and cannot accidentally submit duplicate requests.

## 2026-06-08 11:22:31 +08:00 - Priority 8 Frontend Interaction Test Run

- [x] `npm.cmd run build`
- [x] `npm.cmd run test:frontend-priority8` - 10 checks passed.
- [x] `node --check scripts/test-frontend-security.mjs`
- [x] `npm.cmd audit --audit-level=high` - 0 vulnerabilities.
- [x] `git diff --check`

Failed-first findings corrected:

- Kept the Send button's stable `.send-button` class while busy so its disabled state remains consistently styled and identifiable.
- Isolated browser scenarios by clearing `sessionStorage` between independent cases.
- Corrected missing-token messaging so it says to log in instead of incorrectly reporting an expired session.
- Captured transient authentication-overlay semantics during rendering and measured the persistent auth overlay for reliable mobile geometry verification.

Remaining external test:

- [ ] Use a real logged-in WordPress account without the required capability and confirm the access page returns it to login with the configured explanation.

## 2026-06-08 12:53:48 +08:00 - Live WordPress 401 Diagnosis

Observed evidence:

- [x] The WordPress template checks `current_user_can('edit_posts')` before displaying the chat iframe.
- [x] The backend uses HTTP 403 for a valid JWT missing `edit_posts`; the reported live request returned HTTP 401.
- [x] HTTP 401 now reports token rejection instead of assuming the WordPress session expired.
- [x] `Go to login` links to `https://pathway.training/wp-login.php` with `target="_top"`.
- [x] The production frontend build and all 10 focused browser checks passed.
- [x] The frontend test-harness JavaScript syntax passed.

Pending live verification:

- [ ] Compare SHA-256 fingerprints of the WordPress issuer signing secret and backend `PATHWAY_RAG_JWT_SECRET` without printing either raw secret.
- [ ] Mint a fresh live WordPress token and confirm `/api/ask` returns HTTP 200.
- [ ] If fingerprints match, inspect only the fresh token's `exp`, `cap`, and stable identity claim without recording the complete token.

Backend rerun limitation:

- The focused backend unit test could not start because the repository `.venv` and `uv` environment reference a removed Python 3.12 installation, while system Python lacks FastAPI. Existing test source verifies invalid JWT = 401, missing capability = 403, and valid `edit_posts` JWT = 200.

Optimal result: a newly minted WordPress JWT is accepted by `/api/ask`; wrong-role accounts receive HTTP 403, while signing or expiry failures receive HTTP 401.

## 2026-06-07 17:23:40 +08:00 - Unchecked Test Reconciliation

Reviewed every remaining unchecked test against the completed local, EC2 staging, production PM2, Nginx, public HTTPS, and frontend-browser evidence.

Newly reconciled as passed:

- Nginx overwrites forwarded client identity, Uvicorn is loopback-only, and public TCP port 8000 is closed.
- PM2 runs one saved backend worker on `127.0.0.1:8000`.
- EC2 staging covered authentication, query and token limits, incremental reload, conversation continuity, and durable quota persistence across restart.
- Public HTTPS covered health, missing-token rejection, authenticated ask, conversation continuity, dashboard reload authorization, and protected PDF access.
- Frontend tests covered authentication redirects, remaining-token display, quota error states, and desktop/mobile viewport behavior.
- A current rollback path, pre-release `.env` backup, and approximately 1.2 GB of post-cleanup free disk space were confirmed.

Still intentionally unchecked:

- Genuine WordPress subscriber JWT capability and identity claims.
- Public query/token-limit and short-window HTTP 429 tests.
- Ubuntu ESM Apps review and installation.
- EC2 storage expansion.
- EC2 installation of the secured frontend lockfile.

## 2026-06-09 17:04:34 +08:00 - Public Edge-Test Partial Run

Passed:

- [x] Approved CORS origins `https://chat.pathway.training`, `https://pathway.training`, and the configured Amplify origin returned HTTP 200 with their matching allow-origin header.
- [x] The unapproved `https://attacker.example` origin returned HTTP 400 without an allow-origin header.
- [x] A malformed public JWT returned HTTP 401 with `Invalid token`.
- [x] A correctly signed expired public JWT returned HTTP 401 with `Token expired`.

Not yet executed successfully:

- [ ] Public character-limit rejection.
- [ ] Public estimated-token-limit rejection.
- [ ] Public short-window rate limiting.

Failure cause:

- The older shell JWT stored in `$TOKEN` was absent or no longer available. Curl therefore sent no usable bearer token, and every affected request correctly returned HTTP 401 `Missing token` before reaching the intended validation or rate-limit code.
- The emoji pasted into one command was visibly encoding-corrupted. The rerun should generate it with `chr(0x1F600)` inside Python rather than embedding the character in the terminal.
- Production `.env` was changed to `CHAT_RATE_LIMIT_REQUESTS=3` before the failed rate-limit attempt. Restore the backed-up `.env` and restart PM2 before any other testing.

Optimal result:

- Production is first restored to its normal rate limit.
- A freshly generated one-hour test JWT is validated with a small authenticated request.
- The three pending public tests are rerun with that fresh token.

## Pending Durable Conversation Summary And History Verification

Previously executed tests remain checked in their existing sections. The following tests were generated on 2026-06-10 and have not been run.

### Backend persistence and isolation

- [x] SQLite initialization creates the conversation tables and index without changing existing quota rows.
- [x] One authenticated user receives one stable thread ID even when requests provide different client conversation IDs.
- [x] `GET /api/history` returns only that user's raw messages and never returns the private summary.
- [x] Two users cannot read or influence each other's history or summary.
- [x] Raw history and summary survive database reinitialization with the same SQLite file.

### Automatic summarization

- [x] The first 12 completed exchanges remain visible as 24 raw messages.
- [x] The 13th exchange summarizes the oldest exchange, saves a non-empty cumulative summary, and leaves the newest 12 exchanges visible.
- [x] Later compaction updates the cumulative summary without losing older summary context.
- [x] Empty or failed summarization leaves all raw messages intact.
- [x] Future answers receive the private summary and recent raw history as hidden context.
- [x] Automatic summarization input and output reduce `remaining_tokens`.

### Clear behavior

- [x] Clear summarizes all visible exchanges, removes their raw rows, preserves summary context, and keeps the stable thread ID.
- [x] Clearing an empty visible history performs no model call and consumes no additional tokens.
- [x] Clear charges summarization but does not reset existing daily usage.
- [x] Insufficient balance or summary failure preserves visible raw history.
- [x] A new message after clear receives retained summary context.

### Frontend behavior

- [x] `npm.cmd run test:conversation-summary` loads the authenticated user's newest 12 exchanges after refresh.
- [x] The frontend does not render or expose the private summary.
- [x] A full 12-exchange window warns that the next message may use additional tokens for summarization.
- [x] Clear confirmation explains summarization token usage and that existing usage will not reset.
- [x] Successful clear waits for the backend before removing visible messages and updates the balance.
- [x] Failed clear explains the failure and keeps visible history.

Optimal result: each authenticated user has one durable linear thread, sees at most 12 recent exchanges, retains older context only through a private cumulative summary, and can clear visible history without losing summary context or resetting quota.

## 2026-06-10 23:49:02 +08:00 - Durable Summary Test Run

- [x] Three focused backend conversation tests passed.
- [x] Complete backend security suite passed: 15 tests.
- [x] Conversation-summary frontend suite passed: 3 checks.
- [x] Priority 8 frontend suite passed: 10 checks.
- [x] Complete frontend security suite passed: 20 checks.
- [x] Frontend production build passed.
- [x] Python and JavaScript syntax checks passed.
- [x] `git diff --check` passed.

Failed-first corrections:

- Used the healthy repository-local `.uv-security-env` because system Python lacked FastAPI.
- Shortened a summary-context test query that exceeded the suite's intentional 12-character query limit.
- Made quota reservation read the current output-token cap at call time instead of retaining its import-time value.
- Isolated legacy token-estimate and quota tests from durable conversation context.
- Updated the old clear test to expect the stable one-thread conversation ID.
- Updated the legacy rate-limit assertion to the sanitized notification dialog.
- Removed a redundant Vite `document.readyState` wait and retained the stronger enabled-Send readiness check.

## 2026-06-12 17:45:11 +08:00 - Durable Conversation Audit And Concurrency Verification

- [x] Focused same-user concurrency regression passed.
- [x] Complete backend security suite passed: 16 tests.
- [x] Conversation-summary frontend suite passed: 3 checks.
- [x] Priority 8 frontend suite passed: 10 checks.
- [x] Complete frontend security suite passed: 20 checks.
- [x] Frontend production build passed.
- [x] Python syntax checks passed.

Corrections made during the audit:

- Serialized same-user ask and clear operations to prevent stale summary snapshots during concurrent requests.
- Restored a clear-failure assertion that was temporarily misplaced while adding the concurrency test.
- Reran the two fixed-port frontend suites sequentially after parallel execution produced `EADDRINUSE`.
- Added browser-state diagnostics after the localhost Send check timed out twice; the complete rerun then passed all 20 checks.

Optimal result:

- The current single-process backend cannot lose cumulative summary updates when one user submits overlapping operations.
- All durable history, authorization, quota, clear, responsive-layout, and localhost Send regressions remain green.

## 2026-06-12 18:10:23 +08:00 - Infrastructure, Query Limit, And Citation Verification

- [x] Current tracked tree contains no former public EC2 IP or hostname.
- [x] No `.pem` or `.key` file is tracked.
- [x] Git history audit found the former address in older commits; coordinated history rewrite remains pending.
- [x] Backend 4,000-character query validation passed before pipeline execution.
- [x] Backend estimated input-token validation remained active.
- [x] Frontend production build passed with the matching 4,000-character textarea limit.
- [x] Bearer-header protected file access passed.
- [x] Legacy full-JWT `?token=` file access returned HTTP 401.
- [x] Filename-scoped citation ticket access passed.
- [x] Wrong-filename and expired citation tickets returned HTTP 401.
- [x] Citation URLs retained filenames and PDF page fragments without containing the chat JWT.
- [x] History responses issued usable file tickets while stored citations remained canonical.
- [x] Complete backend security suite passed: 16 tests.
- [x] Dashboard security suite passed: 6 checks.
- [x] Conversation-summary frontend suite passed: 3 checks.
- [x] Priority 8 frontend suite passed: 10 checks.
- [x] Complete frontend security suite passed: 20 checks.
- [x] Frontend production build, Python syntax, and diff checks passed.

Optimal result:

- Users can see and open cited source files without exposing a reusable chat credential.
- Database citation rows contain only normal citation metadata, not secrets or expiring access tokens.
- Deployment identifiers remain absent from the current tree, and history removal is handled as a deliberate repository migration.

## 2026-06-13 16:43:42 +08:00 - EC2 Storage And PM2 Recovery

- [x] Root usage was reduced from 98% to 81%, leaving approximately 1.3 GB available.
- [x] Obsolete and incomplete VS Code Server files, package cache, and old journal data were cleaned up.
- [x] Confirmed the current 8 GB EBS volume had not been expanded, so `growpart` correctly reported no available growth.
- [x] Saved and resurrected the `rag-backend` PM2 process.
- [x] Enabled and started `pm2-ubuntu.service`.
- [x] Confirmed PM2 runs one backend process on `127.0.0.1:8000`.
- [x] Confirmed local and public `/api/health` endpoints return `{"status":"ok"}`.

Optimal result: the backend survives a reboot through systemd/PM2 and the server has immediate working headroom, while EBS expansion remains the durable capacity fix.

## 2026-06-13 16:43:42 +08:00 - Citation Visibility Regression

- [x] Python syntax compilation passed for `rag.py` and `main.py`.
- [x] Frontend production build passed and refreshed the plugin distribution.
- [x] Citation browser regression passed: a response with citation metadata but no inline marker displayed a linked `Sources: [1]` entry with its protected file ticket and PDF page fragment intact.
- [x] Complete backend security suite passed: 16 tests.
- [x] Reran the complete frontend security suite after removing its dependency on Vite HMR page navigation: all 21 checks passed.
- [ ] After deployment, ask a document-backed question through the WordPress page and confirm inline `[n]` references and the linked Sources list both appear and open correctly.

Optimal result: retrieved sources remain visible and clickable even when the model does not emit citation markers, without exposing the reusable chat JWT.

## 2026-06-13 17:30:57 +08:00 - Complete Pending Local Test Run

- [x] Backend security suite passed: 16 tests.
- [x] Dashboard security suite passed: 6 checks.
- [x] Conversation-summary frontend suite passed: 3 checks.
- [x] Priority 8 frontend suite passed: 10 checks.
- [x] Complete frontend security suite passed: 21 checks.
- [x] Citation metadata without model-generated markers displayed a protected linked Sources entry.
- [x] Frontend production build passed and refreshed the plugin distribution.
- [x] Python, dashboard JavaScript, frontend test JavaScript, WordPress template PHP, and plugin PHP syntax checks passed.
- [x] `git diff --check` passed.
- [x] The previously flaky localhost check now uses the real Vite-minted token on the stable test page and confirms an authenticated Send request.
- [x] A later 2026-06-13 `npm.cmd audit --audit-level=high` recheck reports zero vulnerabilities on the installed Vite 6.4.3 dependency tree; a security-driven Vite 8 migration is no longer required.

Production-only unchecked tests reviewed but not executable from this local workspace:

- WordPress issuer secret fingerprint, live token identity/capability, intended subscriber acceptance, unauthorized-user rejection, and authenticated citation opening.
- Public HTTPS character limit, estimated-token limit, and short-window rate-limit checks using a fresh valid WordPress token.
- Ubuntu ESM Apps package review, maintenance approval, dry run, installation, reboot regression, and final package recording.
- Actual EBS expansion or data-volume attachment.

Optimal result: all repository-contained behavior is green; the remaining unchecked items require production credentials, AWS/Ubuntu maintenance access, or an explicit deployment change.

## 2026-06-13 18:39:34 +08:00 - Pending Priority 7 UI Verification

Executed:

- [x] `npm.cmd run test:ui` passed all 4 checks.
- [x] Confirmed the composer and page have no horizontal overflow at 1024 x 768, 1366 x 768, and 390 x 844.
- [x] Confirmed the header information button opens a three-section dialog.
- [x] Confirmed the disclaimer is shown in the information dialog and no longer consumes permanent composer space.
- [x] Confirmed the token section is a stable 2x2 grid showing input usage and maximum response.
- [x] Confirmed the red clear-history action opens the existing confirmation above the information dialog.
- [x] Confirmed Cancel returns to the information dialog.
- [x] Confirmed an estimated request above the known remaining daily balance opens a warning without sending `/api/ask`.
- [x] `npm.cmd run test:frontend-priority8` passed all 10 checks.
- [x] `npm.cmd run test:conversation-summary` passed all 3 checks.
- [x] `npm.cmd run test:frontend-security` passed all 21 checks.
- [x] Confirmed response waiting disables Send, displays an accessible spinner at the button location, prevents duplicate submission, and leaves the chat visible.

Already completed during implementation:

- [x] Frontend production build passed and refreshed the plugin distribution.
- [x] Frontend browser-test script syntax passed.
- [x] `git diff --check` passed.

Optimal result: there is no page-level horizontal scrollbar, the information and clear dialogs layer correctly on desktop/mobile, and requests above the known daily balance are stopped with a clear explanation before network transmission.

Test correction:

- The first Priority 8 run found six old helper calls that did not pass the browser handle after clear-dialog navigation was centralized.
- Updated those test calls and reran the complete suite successfully; no application-code correction was required for that failure.

## 2026-06-13 20:09:23 +08:00 - Final Priority 7 Formatting And Loading Verification

- [x] Confirmed balanced backend `**text**` renders as bold without displaying the asterisks.
- [x] Confirmed bold formatting and inline citation links render correctly in the same answer.
- [x] Confirmed a Pathway bot bubble and loading spinner appear immediately after send.
- [x] Confirmed the pending bubble is replaced in place by the complete returned answer instead of creating a second AI bubble.
- [x] Confirmed pending AI placeholders are not written to `sessionStorage`.
- [x] Frontend production build and JavaScript syntax checks passed.
- [x] UI suite passed: 5 checks.
- [x] Priority 8 suite passed: 10 checks.
- [x] Conversation-summary suite passed: 3 checks.
- [x] Complete frontend security suite passed: 21 checks.

Test correction:

- The first UI run detected bold content before the typing animation had reached the later citation marker.
- Updated the test to wait for both final rendered elements. The final implementation then replaced the old typing animation with a direct pending-bubble-to-complete-answer swap, eliminating transient raw formatting markers.
- Final diff review found pending-bubble cleanup attached to the clear-history failure path instead of the answer-request failure path.
- Moved cleanup to the request catch block, asserted failed requests leave no response spinner, and reran the production build plus all 39 frontend checks successfully.

## 2026-06-15 17:16:36 +08:00 - Dashboard Local And EC2 Document Target Verification

Completed locally:

- [x] Dashboard server and security-test JavaScript syntax passed.
- [x] Dashboard inline browser JavaScript syntax passed.
- [x] Dashboard security configuration suite passed all 8 checks.
- [x] Dashboard root returned HTTP 200 from a temporary local process.
- [x] Local document listing returned HTTP 200.
- [x] An unsupported document target returned HTTP 400.
- [x] EC2 selection without configured SSH settings returned a clear configuration error and did not fall back to local files.
- [x] Disabled remote-feature UI text and controls are absent from the dashboard markup.

New live workflow tests:

- [x] Click Local and EC2 and confirm the active control, document heading, helper text, and file list all switch together.
- [x] With valid `dashboard/.env` SSH settings, confirm EC2 mode lists the production `rag-backend/docs` directory.
- [ ] Upload a uniquely named supported document in EC2 mode and confirm SFTP transfer succeeds, PM2 restarts, and `rag-backend` returns online.
- [ ] Confirm the uploaded EC2 document can be retrieved by a document-backed chat query.
- [ ] Delete the disposable EC2 document and confirm it is removed remotely, PM2 returns online, and the document is no longer retrieved.
- [ ] Confirm unsafe filenames and unsupported extensions cannot be uploaded or deleted in either target.

Optimal result: the selected target is explicit and isolated, local behavior remains unchanged, and configured EC2 document changes safely reload the production index through the existing SSH connection.

## 2026-06-15 18:36:17 +08:00 - Dashboard SSH Configuration Verification

- [x] Confirmed `dashboard/.env` exists locally and is ignored by Git.
- [x] Confirmed the required SSH host, user, key path, and remote root values are configured without logging their sensitive values.
- [x] Confirmed the configured PEM file exists outside the repository.
- [x] Removed broad Windows group access that caused OpenSSH to reject the PEM as unprotected.
- [x] Direct non-interactive SSH verification succeeded.
- [x] Restarted the dashboard after creating `.env`.
- [x] Dashboard EC2 document listing returned HTTP 200 and listed the remote files.

Optimal result: local configuration and key permissions are accepted by SSH, secrets remain untracked, and dashboard EC2 mode connects successfully.

## 2026-06-15 18:32:48 +08:00 - Dashboard Service Controls And Document Search Verification

Completed:

- [x] Dashboard server, security-test, and inline browser JavaScript syntax passed.
- [x] Dashboard security configuration suite passed all 9 checks.
- [x] Unknown local service names are rejected with HTTP 400.
- [x] Stopping a service that is not tracked returns success with `stopped: false`.
- [x] Dashboard-launched Vite reached Ready and produced frontend output.
- [x] Frontend Stop terminated the Vite process tree and released port 5173.
- [x] Dashboard-launched Uvicorn reached Ready and produced backend output.
- [x] Backend Stop terminated the Uvicorn process tree and released port 8000.
- [x] Dashboard markup includes separate Stop controls, frontend output, and document search.

New browser interaction tests:

- [x] Confirm backend and frontend Stop buttons enable only after the dashboard launches their respective processes.
- [x] Confirm backend and frontend output remains visually separate and automatically scrolls to the newest line.
- [x] Confirm document search is case-insensitive and filters both Local and EC2 filename lists.
- [x] Confirm changing Local/EC2 target clears the previous search and loads the selected environment's complete list.
- [x] Confirm clearing the query restores the cached list without another document API or SSH request.

Optimal result: dashboard-owned development processes can be ended cleanly, both CLI streams are visible, and document search is fast, isolated, and non-destructive.

## 2026-06-16 15:48:06 +08:00 - Dashboard Pending Local Browser Verification

- [x] `npm.cmd run test:security` passed all 9 dashboard security configuration checks.
- [x] `npm.cmd run test:ui` passed all 5 frontend UI checks.
- [x] Headless Chrome confirmed Local is the initial active document target and Stop buttons are disabled before dashboard-managed services are launched.
- [x] Headless Chrome confirmed backend/frontend Stop buttons follow launched, ready, and stopped UI states.
- [x] Headless Chrome confirmed EC2 target selection updates the active control, title, helper text, and loads 55 remote documents through the configured SSH route.
- [x] Headless Chrome confirmed document search is case-insensitive, no-match text is clear, clearing the query restores the cached list, and switching target clears the search.
- [x] Headless Chrome confirmed backend and frontend output consoles remain separate and automatically scroll to the newest line.

Not run:

- [ ] EC2 upload, retrieval, and deletion workflow tests were not run because they mutate production documents and require explicit approval for a disposable production file.
- [ ] Production WordPress token, public rate-limit/query-limit, Ubuntu Pro, EBS expansion, and Git-history rewrite checks remain external or blocked.

Optimal result: all locally reproducible unchecked dashboard UI checks are now covered without changing production documents.

## 2026-06-16 16:41:39 +08:00 - Priority 8 Token, Iframe, And Dashboard Branch Sync Verification

Implemented and tested the new unchecked Priority 8 items from `TASKS.md`.

Completed:

- [x] Frontend info dialog now always shows a daily balance row, including a waiting state before the backend returns `remaining_tokens`.
- [x] The WordPress Ask AI template and hosted chat root use dynamic viewport/min-height sizing instead of depending on a rigid inherited `100%` height.
- [x] Dashboard can check the active EC2 Git branch and short commit through SSH.
- [x] Dashboard can sync local `rag-backend/prompt.txt` to the active EC2 checkout and optionally commit/push to that same active branch after a one-line commit message is provided.
- [x] `node --check dashboard/server.js` passed.
- [x] `node --check dashboard/security.test.js` passed.
- [x] `node --check scripts/test-frontend-security.mjs` passed.
- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `cd dashboard && npm.cmd run test:security` passed all 13 dashboard checks.
- [x] `cd webapp && npm.cmd run build` passed and refreshed `plugin/dist`.
- [x] `cd webapp && npm.cmd run test:ui` passed all 5 UI checks, including the daily balance row.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 checks.
- [x] `cd webapp && npm.cmd run test:conversation-summary` passed all 3 summary checks.
- [x] `cd webapp && npm.cmd run test:frontend-security` passed all 21 frontend security checks.

Not executed:

- [ ] The dashboard `Sync Prompt to EC2` button was not clicked against production because it uploads and restarts the live EC2 backend. Use it only when an intentional prompt deployment is desired.
- [ ] The optional dashboard prompt commit/push path was source- and helper-tested locally but not executed against EC2 to avoid creating a production commit without approval.

Optimal result: users can see token balance state from the info dialog, the hosted iframe fits the WordPress Ask AI viewport, and prompt changes can be deployed to the same branch EC2 is actually running without the browser choosing an arbitrary branch.

## 2026-06-16 17:12:41 +08:00 - Hosted Ask AI Scroll Regression Fix

Fixed the frontend layout issue shown in the WordPress-hosted Ask AI screenshot.

Completed:

- [x] WordPress Ask AI template now hides parent page overflow and sizes the iframe to the viewport minus the WordPress admin bar when present.
- [x] Chat root/card now use fixed viewport flex sizing, so the document body does not become the chat scroller.
- [x] The chat logo/info topbar stays pinned while the message log scrolls.
- [x] Loaded chat history scrolls to the bottom after React renders the messages.
- [x] Removed the older fixed `380px` chat-log height override by replacing it with a flexing internal scroll region.
- [x] `node --check scripts/test-frontend-security.mjs` passed.
- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `cd webapp && npm.cmd run build` passed and refreshed `plugin/dist`.
- [x] `cd webapp && npm.cmd run test:ui` passed all 6 UI checks, including one internal scrollbar, bottom-loaded history, and pinned topbar.
- [x] `cd webapp && npm.cmd run test:conversation-summary` passed all 3 summary checks.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 checks after rerunning sequentially.
- [x] `cd webapp && npm.cmd run test:frontend-security` passed all 21 frontend security checks.

Test note:

- The first `test:frontend-priority8` attempt was run in parallel with `test:conversation-summary` and failed with `EADDRINUSE` on the shared test port. The sequential rerun passed without code changes.

Optimal result: the WordPress page has only one visible right-side scrollbar, the chat opens at the latest message, and the Pathway logo/info controls remain visible while reviewing long answers.

## 2026-06-16 17:36:18 +08:00 - Ask AI Measured Height Follow-Up

Replaced the previous fixed WordPress admin-bar height subtraction with measured viewport sizing.

Completed:

- [x] `page-ask-ai.php` now computes available height from `.askai-wrap.getBoundingClientRect().top` and `visualViewport.height`/`innerHeight`.
- [x] The iframe wrapper consumes `--askai-available-height` with a `100dvh` CSS fallback.
- [x] Hard-coded `32px` and `46px` admin-bar offsets were removed.
- [x] Frontend security tests now assert the WordPress template uses measured height and does not include those fixed admin-bar values.
- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `node --check scripts/test-frontend-security.mjs` passed.
- [x] `cd webapp && npm.cmd run build` passed and refreshed `plugin/dist`.
- [x] `cd webapp && npm.cmd run test:ui` passed all 6 UI checks.
- [x] `cd webapp && npm.cmd run test:frontend-security` passed all 21 frontend security checks.

Optimal result: the Ask AI iframe height adapts to the actual WordPress/admin-bar layout without hard-coded pixel offsets, leaving only the intended chat-log scrollbar visible.

## 2026-06-16 18:15:23 +08:00 - Citation And Outline Formatting Verification

Fixed the response formatting issue where model output placed `[1]` before bold outline headings and collapsed outline bullets into one paragraph.

Completed:

- [x] Frontend answer rendering now normalizes citation markers away from Roman numeral, numbered, lettered, and bold heading positions before rendering.
- [x] Frontend answer rendering restores line breaks before inline outline sections and bullet-style `-` points.
- [x] Citation links still render when markers remain in sentence/body positions.
- [x] `rag-backend/prompt.txt` now tells the model to place citations at the end of supported sentences or paragraphs and never before headings, outline labels, or bolded headings.
- [x] `node --check scripts/test-frontend-security.mjs` passed.
- [x] `git diff --check` passed before documentation updates.
- [x] `cd webapp && npm.cmd run build` passed and refreshed `plugin/dist`.
- [x] `cd webapp && npm.cmd run test:ui` passed all 7 UI checks, including the new outline/citation regression.
- [x] `cd webapp && npm.cmd run test:frontend-security` passed all 21 frontend security checks.
- [x] `python -m py_compile rag-backend/main.py rag-backend/rag.py` passed.
- [x] `cd webapp && npm.cmd run test:conversation-summary` passed all 3 summary checks.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 checks after rerunning sequentially.

Test note:

- The first Priority 8 run was started in parallel with the summary suite and failed with `EADDRINUSE` on the shared browser-test port. The sequential rerun passed without code changes.

Optimal result: outline-style answers no longer show `[1]` before headings or bold labels, outline sections are readable, and supported factual sentences can still keep citation links.


## 2026-06-16 19:56:52 +08:00 - Token Help, Daily Balance Load, And Double-Header Fix Verification

Added the larger info button, the token-usage help popover, the daily-balance-on-load behavior, and the iframe top-redirect fix for the duplicated WordPress admin bar. All previously executed checks above remain checked.

Executed in this environment:

- [x] `python -m py_compile rag-backend/main.py` passed.
- [x] `python -m unittest tests.test_backend_security` passed all 17 backend checks, including the new `test_history_reports_remaining_daily_tokens` (history returns `remaining_tokens`).
- [x] `esbuild` bundled `webapp/src/main.tsx` with no TypeScript/JSX errors (the repo build uses esbuild for transforms).
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] `git diff` shows only the intended source/test/doc changes with no line-ending churn.

### Pending Host Browser Verification (Chrome required)

These browser checks were authored but could not run in the Linux build environment because Chrome is not installed here. Run them on a Windows/host machine with Chrome.

- [ ] `cd webapp && npm run build` regenerates `dist` and refreshes `plugin/dist`.
- [ ] `npm run test:ui` passes all 10 UI checks, including:
  - [ ] The info button computes to at least 44x44 px with an icon of at least 24x24 px (Task 80).
  - [ ] The token help button reveals a bubble explaining "Input tokens" and "Max response" in plain language and toggles closed again (Task 81).
  - [ ] On a fresh load the info dialog shows the backend daily balance (e.g. "3,200 daily tokens remaining") with no message sent (Task 82).
- [ ] `npm run test:frontend-security` passes all 22 checks, including "expired token inside an iframe redirects the top window, not the frame" (double-header bug fix).
- [ ] `npm run test:frontend-priority8` still passes all 10 Priority 8 checks.
- [ ] `npm run test:conversation-summary` still passes all 3 summary checks.

### Manual Production Verification

- [ ] Open Ask AI from WordPress, allow the JWT to expire, send a message, and confirm the browser redirects to the login page at the top level with only one WordPress admin bar (no stacked/duplicated header) and no nested iframe.

Optimal result: the three new Priority 8 items behave as specified and a timed-out embedded session never produces a duplicated WordPress header.

## 2026-06-16 22:03:50 +08:00 - Priority 8 Token UI Redo Verification

Corrected and verified the three Priority 8 token UI/balance tasks after the previous implementation placed the help control beside the wrong heading.

Completed:

- [x] The top-right info button remains a larger 44x44 px target with a 24x24 px icon, but now uses a cleaner transparent/header-native style.
- [x] The token help controls now sit inside `.token-grid dt` beside `Input tokens` and `Max response`.
- [x] No token help button remains beside the `Token usage` section title.
- [x] Each help button opens a specific plain-language bubble for its own token field.
- [x] The latest valid daily balance is cached in session storage and used as a refresh fallback while `/api/history` remains authoritative when it returns `remaining_tokens`.
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] `cd webapp && npm.cmd run build` passed.
- [x] `cd webapp && npm.cmd run test:ui` passed all 10 UI checks.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 frontend checks.
- [x] `cd webapp && npm.cmd run test:conversation-summary` passed all 3 conversation-summary frontend checks.
- [x] `python -m py_compile rag-backend/main.py rag-backend/rag.py` passed.
- [x] `cd rag-backend && ..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v` passed all 17 backend checks.

Blocked/failed checks:

- [ ] `cd webapp && npm.cmd run test:frontend-security` timed out three times on the first hosted-domain `Page.navigate` call before any app assertion ran. The focused UI and Priority 8 suites that cover the new changes passed in this environment.
- [ ] `cd webapp && npm.cmd audit --audit-level=high` reports the existing Vite/esbuild advisory chain and recommends a breaking Vite 8 upgrade; no dependency change was made during this UI redo.

Optimal result: the token table contains the question-mark help controls in the correct cells, the info button is visible without looking oversized, and the daily balance does not normally show the waiting fallback after refresh.

## 2026-06-16 23:26:50 +08:00 - Token Help Bubble And Balance Fallback Follow-Up

Fixed and verified the follow-up issues shown in the screenshots.

Completed:

- [x] Token-help bubbles are no longer clipped by the token grid.
- [x] The input-token and max-response bubbles are side-aware and stay inside the information dialog.
- [x] Added authenticated `GET /api/balance` for direct daily-balance lookup.
- [x] Frontend now falls back from `/api/history` to `/api/balance` when history does not include a usable `remaining_tokens`.
- [x] Frontend tests cover the missing-history-balance case and assert the help bubble remains within the dialog bounds.
- [x] Backend tests cover `/api/balance` for both used and fresh daily-token buckets.
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] `python -m py_compile rag-backend/main.py rag-backend/rag.py` passed.
- [x] `cd webapp && npm.cmd run build` passed.
- [x] `cd rag-backend && ..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v` passed all 17 backend checks.
- [x] `cd webapp && npm.cmd run test:ui` passed all 10 UI checks.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 frontend checks.

Optimal result: the `?` popovers render above the token grid instead of under or behind it, and Daily balance shows a numeric value after refresh without requiring the user to send a message.

## 2026-06-17 10:04:03 +08:00 - Contributor Ask AI Access Verification

Verified the repository-side contributor access configuration.

Completed:

- [x] `webapp/page-ask-ai.php` now defines `$ask_ai_required_cap = 'edit_posts'`.
- [x] The WordPress page gate uses `current_user_can($ask_ai_required_cap)`.
- [x] The hosted iframe receives the same value through `requiredCap`.
- [x] Documentation explains that `edit_posts` allows contributors and above.
- [x] Documentation explains that future all-logged-in access should use `read` in the WordPress page, backend `JWT_REQUIRED_CAP`, and token issuer JWT `cap` claim together.
- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] `python -m py_compile rag-backend/main.py rag-backend/rag.py` passed.
- [x] `cd webapp && npm.cmd run build` passed.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 frontend checks.
- [x] `cd webapp && npm.cmd run test:ui` passed all 10 UI checks.
- [x] Direct template checks confirmed `$ask_ai_required_cap = 'edit_posts'`, `current_user_can($ask_ai_required_cap)`, iframe `requiredCap`, and future `read` guidance.
- [ ] `cd webapp && npm.cmd run test:frontend-security` timed out on the first Chrome `Page.navigate` call before app assertions ran.

Manual production check:

- [ ] Log in as a WordPress Contributor and confirm the Ask AI page embeds chat and can send a message.

Optimal result: WordPress Contributors can access Ask AI with the same `edit_posts` capability required by the backend token validation.

## 2026-06-17 10:26:29 +08:00 - Contributor Access Simplification Verification

Verification for the simplified WordPress Contributor-role access check. Previously completed checks above remain recorded as historical results.

Completed:

- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] Direct template checks confirmed the page uses `in_array('contributor', $user_roles, true)`, `current_user_can('edit_posts')`, and iframe `'requiredCap' => 'edit_posts'`.
- [x] `cd webapp && npm.cmd run build` passed.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 frontend checks.
- [x] `cd webapp && npm.cmd run test:ui` passed all 10 UI checks.

Pending:

- [ ] Manual production check: log in as a WordPress user whose roles include Contributor and confirm Ask AI embeds chat instead of redirecting.

Optimal result: Contributor-role users can enter the WordPress Ask AI page, higher standard WordPress roles still enter through `edit_posts`, and the backend capability requirement remains unchanged.

## 2026-06-17 10:51:36 +08:00 - Contributor Role Auth Correction Verification

Verification for the corrected role-based auth model after live WordPress debug output showed `Roles: subscriber, contributor` and `Can edit_posts: no`.

Completed:

- [x] `php -l webapp/page-ask-ai.php` passed.
- [x] `python -m py_compile rag-backend/main.py rag-backend/rag.py` passed.
- [x] `node --check webapp/scripts/test-frontend-security.mjs` passed.
- [x] `cd webapp && npm.cmd run build` passed.
- [x] `cd webapp && npm.cmd run test:frontend-priority8` passed all 10 Priority 8 frontend checks.
- [x] `cd webapp && npm.cmd run test:ui` passed all 10 UI checks.
- [x] `cd rag-backend && ..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v` passed all 17 backend checks.

Pending:

- [ ] Manual WordPress check: external token issuer allows role `contributor` and mints JWT `cap` containing `contributor`.
- [ ] Manual EC2 check: production `.env` has `JWT_REQUIRED_CAP=contributor`, PM2 is restarted, and `/api/health` returns OK.

Optimal result: WordPress Contributor-role users can load Ask AI and send messages even when their role does not include `edit_posts`.
