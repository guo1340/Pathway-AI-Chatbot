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
