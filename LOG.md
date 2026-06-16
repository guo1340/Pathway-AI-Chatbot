# LOG.md

Append-only implementation history and verification instructions for completed tasks. Add one work-log entry and one testing section for every completed task.

## Work Log

### 2026-06-05 17:27:47 +08:00 - Content-Aware Document Chunking

Completed the Priority 1 task to replace fixed-size-only document chunking with content-aware chunking.

Changes:

- Added `CHUNK_MIN_SIZE` and `CHUNK_MAX_SIZE` configuration.
- Kept legacy `CHUNK_SIZE` support as the fallback maximum size.
- Configured recursive splitting to prefer paragraphs, lines, sentences, and words before splitting individual characters.
- Added merging for undersized adjacent chunks when the merged result remains within the maximum size.
- Added validation for invalid minimum, maximum, and overlap settings.
- Included the chunk configuration in indexed metadata so changing chunk settings triggers re-indexing.

Verification performed:

- Python syntax compilation passed for `rag.py` and `main.py`.
- Focused chunk-merging behavior test passed.
- `git diff --check` passed.
- Full backend startup was not run because the existing `.venv` points to a missing Python 3.12 installation.

### 2026-06-05 17:27:47 +08:00 - Incremental Document Indexing

Completed the Priority 1 task to avoid rebuilding and re-embedding the entire Chroma collection after every document upload.

Changes:

- Added SHA-256 fingerprints for source files.
- Added normalized source keys, source hashes, chunk configuration, chunk indexes, and deterministic chunk IDs to Chroma metadata.
- Changed `RagPipeline.reload()` into an incremental synchronization operation.
- New files are embedded and added.
- Changed files are embedded first, then their obsolete chunks are removed.
- Deleted files have their indexed chunks removed.
- Unchanged files are skipped without new embedding requests.
- Existing legacy chunks are migrated during the first reload because they do not contain fingerprint metadata.
- Kept the `reload()` method name so existing API and dashboard callers remain compatible.

Verification performed:

- Python syntax compilation passed for `rag.py` and `main.py`.
- A focused fake-vector-store test passed for adding, updating, deleting, and skipping files.
- `git diff --check` passed.
- No OpenAI embedding requests were made during automated verification.
- Full backend startup was not run because the existing `.venv` points to a missing Python 3.12 installation.

### 2026-06-05 20:20:53 +08:00 - Scanned PDF OCR Indexing

Completed scanned-PDF support after testing showed that image-only PDF pages did not provide text to the vector index.

Changes:

- Kept `PyPDFLoader` as the primary path for PDFs with embedded text.
- Added page-level OCR fallback only when extracted text is below `PDF_OCR_MIN_TEXT_CHARS`.
- Added PyMuPDF to render scanned pages and `pytesseract` to recognize their text.
- Added RapidOCR as an automatic local fallback when the Tesseract executable is unavailable.
- Preserved PDF source and page metadata for chunking and citations.
- Marked OCR-produced pages with `ocr: true` metadata.
- Added configurable OCR enablement, text threshold, render DPI, language, and Tesseract executable path.
- Included OCR settings in each PDF's index configuration so existing PDFs are reprocessed once and settings changes invalidate only PDF indexes.
- Added `pymupdf` and `pytesseract` backend dependencies.
- Explicit Tesseract mode produces a clear error when the executable is unavailable; automatic mode falls back to RapidOCR.

Verification performed:

- Python syntax compilation passed.
- Mocked native-text PDF behavior passed without invoking OCR.
- Mocked scanned-page OCR behavior passed and preserved page metadata.
- `uv.lock` was refreshed and validated against Python 3.12 with PyMuPDF, `pytesseract`, and Pillow.
- Tesseract was not available on this workstation, which prompted the later automatic RapidOCR fallback.

### 2026-06-05 21:27:35 +08:00 - Full LOG.md Test Execution

Executed every documented Priority 1, incremental-indexing, PDF, and authentication test in an isolated workspace.

Changes made after the first test pass:

- Added RapidOCR as a locked local OCR fallback because Tesseract could not be installed in the test environment.
- Added `PDF_OCR_ENGINE=auto`, `tesseract`, and `rapidocr` modes.
- Included the selected OCR mode in PDF index configuration so changing engines safely re-indexes PDFs.
- Updated OCR setup and troubleshooting documentation.

Verification performed:

- All 17 focused checks passed.
- Real RapidOCR processed generated image-only and mixed PDFs.
- Authenticated `/api/reload` and `/api/upload` requests passed with a valid dashboard JWT.
- Missing or invalid authentication was rejected.
- Failed scanned-PDF processing preserved the existing index.
- Tests used temporary document and Chroma directories and made no OpenAI calls.
- Full results are recorded in [`TEST_LOG.md`](TEST_LOG.md).

### 2026-06-05 22:01:25 +08:00 - Sal Branch Release Preparation

Prepared the accumulated backend indexing, OCR, authentication-page, and documentation changes for commit to the `Sal` branch.

Changes:

- Cleared `rag-backend/context.txt` because it is generated conversation/debug output and should not retain branch-specific test content.
- Replaced the older `Sal` prompt with the newer `main` branch version.
- Reviewed all intended commit candidates for secrets and generated runtime data.
- Excluded `.env`, document files, Chroma data, build output, and `bash.exe.stackdump` from the commit.
- Kept only the safe `.env.example` placeholder values.

Verification required before push:

- Compile the backend Python modules.
- Validate the dependency lock.
- Build the frontend source.
- Parse dashboard JavaScript and lint WordPress PHP.
- Run `git diff --check`.
- Inspect the final staged file list and staged diff for credentials or generated data.

### 2026-06-05 22:45:59 +08:00 - Local Dashboard Service Controls

Completed independent local backend and frontend launch controls.

Changes:

- Added separate Launch Backend and Launch Frontend buttons.
- Added backend and frontend health indicators and local links.
- Split process tracking so either service can be launched independently.
- Removed the unsupported Uvicorn `--no-reload` option.
- Corrected the Vite health target to `http://localhost:5173`.
- Kept coworker-specific project and SSH paths unchanged.

Verification performed:

- Dashboard server syntax and inline browser script parsing passed.
- Frontend launch returned success and `http://localhost:5173` returned HTTP 200.
- Backend launch returned success and `/api/health` became ready.
- Local status correctly reported independently running services.

### 2026-06-05 22:45:59 +08:00 - Local Dashboard Document Management

Made local dashboard document operations compatible with the backend's authenticated incremental APIs.

Changes:

- Local document listing now reads `rag-backend/docs`.
- Uploads are proxied to authenticated backend `POST /api/upload`.
- Deletions remove the local file and call authenticated `POST /api/reload`.
- Added short-lived JWT generation using the configured backend secret.
- Added an in-memory local JWT fallback shared only with a backend process launched by the dashboard.
- Preserved backend incremental indexing and OCR behavior by routing uploads through the backend.

Verification performed:

- Listed 39 existing local documents.
- Uploaded a temporary text file through the dashboard; backend returned HTTP 200 and reported 79 bytes indexed.
- Deleted the temporary file through the dashboard; authenticated reload returned HTTP 200.
- Confirmed the temporary file was absent afterward and the document count returned to 39.
- Removed the temporary source file after testing.

### 2026-06-05 22:45:59 +08:00 - Remote Dashboard Operation Lock

Locked remote operations until the backend is tested and approved for deployment.

Changes:

- Added a single `REMOTE_API_ENABLED=false` server flag.
- Remote mode toggle, prompt sync, and restart routes now return HTTP 423.
- Replaced remote action controls with buttons that open an explanatory dialog.
- Dialog supports the Understood button, close button, backdrop click, and Escape key.
- Left SSH host, key, user, and remote paths unchanged for the coworker's environment.

Verification performed:

- Remote toggle, prompt sync, and restart endpoints returned HTTP 423.
- Static DOM checks confirmed the dialog text and all requested dismissal handlers are present.
- Full visual browser interaction was not available because the in-app browser could not start in the Windows sandbox.

### 2026-06-05 23:29:17 +08:00 - Full LOG.md Regression Run

Executed every test procedure documented in this file, including the backend, OCR, incremental indexing, dashboard, remote lock, and release checks.

Changes required after failed tests:

- Corrected the ignored local OpenAI model setting from `gpt-40-mini` to `gpt-4o-mini`.
- Prevented adjacent-page expansion from performing page arithmetic for text documents without numeric page metadata.
- Changed the citation API base default to `http://localhost:8000` so local dashboard citations remain in the local stack; deployments can still set `API_BASE`.

Verification performed:

- All 18 isolated backend and API checks passed.
- Local backend/frontend launch, duplicate prevention, upload, retrieval, citation, delete, and Chroma cleanup passed.
- Remote toggle, prompt sync, and restart remained locked with HTTP 423.
- All four dialog dismissal paths passed through execution of the actual browser script with a mocked DOM.
- Python compilation, dependency lock validation, Vite build, dashboard JavaScript parsing, PHP lint, and `git diff --check` passed.
- Detailed results are recorded in [`TEST_LOG.md`](TEST_LOG.md).

### 2026-06-06 00:21:45 +08:00 - Dashboard Pre-Push Edge Hardening

Executed the remaining dashboard pre-push failure, browser, prompt, and upload edge tests.

Changes:

- Restored a local document if deletion succeeds on disk but authenticated backend reload fails.
- Restricted uploads to the backend-supported `.txt`, `.md`, `.html`, and `.pdf` extensions.
- Used a temporary upload file and atomic replacement so rejected oversized replacements do not destroy an existing same-name document.
- Preserved backend HTTP status codes through the dashboard upload proxy.
- Added the supported file filter to the dashboard picker.
- Fixed mobile horizontal overflow at a 390-pixel viewport.
- Removed the dashboard Version Control section and its Git API routes.

Verification performed:

- Backend-stopped deletion restored the original file and returned a clear failure.
- Multiple, duplicate, unsupported, oversized, and backend-stopped uploads produced the expected results.
- Prompt save/read passed and the original prompt was restored to a zero Git diff.
- Chrome desktop and true mobile emulation passed without horizontal overflow.
- All test sources, temporary upload files, and Chroma chunks were removed.
- Detailed results are recorded in [`TEST_LOG.md`](TEST_LOG.md).

## Steps and Instructions for Testing

### Local Dashboard Service Controls

1. Install the existing dashboard dependencies:

   ```powershell
   cd "E:\Pathway\AI Chat\Pathway-AI-Chatbot\dashboard"
   npm install
   ```

2. Start the dashboard:

   ```powershell
   npm start
   ```

3. Open `http://localhost:3131`.
4. Click Launch Backend.

Expected result:

- The backend status changes from stopped, to starting, to ready.
- The backend health link becomes available.
- Backend output appears in the local log panel.
- `http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.

5. Click Launch Frontend.

Expected result:

- The frontend status changes from stopped, to starting, to ready.
- The local chatbot link becomes available.
- `http://localhost:5173` loads the Vite chatbot.
- Repeated launch clicks do not start duplicate tracked processes.

### Local Dashboard Document Management

1. Launch the local backend from the dashboard and wait for Ready.
2. Upload a small `.txt`, `.md`, `.html`, or `.pdf` test file through the dropzone.

Expected result:

- Upload progress completes successfully.
- The backend receives an authenticated `/api/upload` request.
- The file appears in the local document list.
- Only the new or changed file is embedded; unchanged files are skipped.
- Scanned PDFs use the configured OCR fallback.

3. Ask the local chatbot a question containing unique text from the uploaded file.

Expected result:

- The answer can retrieve the new content and cite the uploaded document.

4. Click Remove for the test file and confirm.

Expected result:

- The file disappears from `rag-backend/docs`.
- The dashboard calls authenticated `/api/reload`.
- Chunks belonging to the removed file are deleted from Chroma.
- Other documents remain indexed.

### Remote Dashboard Operation Lock

1. Click Remote Sync Locked or Remote Restart Locked.

Expected result:

- A dialog explains that remote uploads and server changes are unavailable because the updated backend is not deployment-tested.

2. Open and close the dialog using each method:

- Click Understood.
- Click the `x` close button.
- Click the empty backdrop outside the dialog.
- Press Escape.

Expected result:

- Every method closes the dialog.
- No remote HTTP or SSH operation is performed.

### Text Document Retrieval Regression

1. Launch the backend and frontend from the local dashboard.
2. Upload a visible `.txt` file containing a unique phrase.
3. Ask the local chatbot a question that includes the unique phrase.

Expected result:

- The upload is indexed without rebuilding unchanged documents.
- The chat request returns HTTP 200; text documents without page metadata do not raise an adjacent-page error.
- The answer retrieves the unique phrase and cites the uploaded file.
- The citation URL begins with `http://localhost:8000` unless `API_BASE` is explicitly configured.

4. Delete the test document from the dashboard.

Expected result:

- The source disappears from `rag-backend/docs` and the dashboard list.
- Authenticated `/api/reload` removes only that document's Chroma chunks.

### Dashboard Upload and Delete Failure Cases

1. Stop the local backend and try to delete an existing test document.

Expected result:

- The dashboard returns a failure stating that index reload failed.
- The source file is restored with unchanged content.

2. Start the backend and upload two supported files together.
3. Upload a changed file using the same filename.

Expected result:

- Both supported files upload and index successfully.
- The duplicate filename replaces and re-indexes that document.

4. Try uploading an unsupported extension.
5. Set a small `MAX_UPLOAD_MB` test value and upload a larger same-name replacement.

Expected result:

- Unsupported files return HTTP 400 and are not saved.
- Oversized files return HTTP 413.
- An existing same-name document remains unchanged after the oversized upload.
- No `.upload-*.tmp` files remain.

3. Directly call `/api/toggle`, `/api/server/sync-prompt`, or `/api/server/restart`.

Expected result:

- Each route returns HTTP 423 with the remote-lock explanation.

### Content-Aware Document Chunking

#### Test 1: Configuration Validation

1. Recreate or repair the backend Python environment:

   ```powershell
   cd "E:\Pathway\AI Chat\Pathway-AI-Chatbot\rag-backend"
   uv sync
   ```

2. Configure valid values in `.env`:

   ```dotenv
   CHUNK_MIN_SIZE=200
   CHUNK_MAX_SIZE=1000
   CHUNK_OVERLAP=200
   ```

3. Start the backend:

   ```powershell
   uv run uvicorn main:app --host 127.0.0.1 --port 8000
   ```

Expected result:

- The backend starts without a chunk-configuration error.
- Existing `CHUNK_SIZE` still works as the maximum when `CHUNK_MAX_SIZE` is absent.

4. Stop the backend and temporarily set an invalid configuration, such as:

   ```dotenv
   CHUNK_MIN_SIZE=1200
   CHUNK_MAX_SIZE=1000
   ```

5. Start the backend again.

Expected result:

- Startup fails immediately with `CHUNK_MIN_SIZE must be between 1 and CHUNK_MAX_SIZE`.
- No index changes are made.

#### Test 2: Chunk Size and Content Boundaries

1. Add a temporary `.txt` or `.md` document to `rag-backend/docs` containing several paragraphs, short lines, and one long paragraph.
2. Use valid minimum, maximum, and overlap settings.
3. Start the backend and run an authenticated `POST /api/reload`.
4. Inspect the indexed chunks in Chroma or temporarily print the output of `_split(_load_docs_from_file(<test-file>))`.
5. Remove any temporary debug print after testing.

Expected result:

- Chunks do not exceed `CHUNK_MAX_SIZE`.
- Most chunks meet or exceed `CHUNK_MIN_SIZE`.
- A final or standalone section may remain below the minimum when merging it would exceed the maximum.
- Splits favor paragraph, line, sentence, and word boundaries.
- Source and page metadata remain available for citations.

#### Test 3: Chunk Configuration Change

1. Index a test document with one set of chunk values.
2. Record its stored `chunk_config` metadata.
3. Change `CHUNK_MIN_SIZE`, `CHUNK_MAX_SIZE`, or `CHUNK_OVERLAP`.
4. Restart the backend and run an authenticated `POST /api/reload`.

Expected result:

- The document is treated as changed even though its file bytes did not change.
- New chunks use the updated `chunk_config`.
- Old chunk IDs are removed after the replacement chunks are added.

### Incremental Document Indexing

#### Test 1: One-Time Legacy Migration

1. Back up `rag-backend/chroma_store` before testing against an existing index.
2. Start the repaired backend environment.
3. Run an authenticated `POST /api/reload` once.

Expected result:

- Files whose existing chunks lack `source_hash` and `chunk_config` metadata are re-indexed once.
- Existing chunks are removed only after replacement chunks are successfully embedded.
- The index remains available if embedding a replacement fails.

4. Run `POST /api/reload` a second time without changing files or chunk settings.

Expected result:

- All successfully migrated files are classified as unchanged.
- No document embeddings are requested on the second reload.

#### Test 2: Add a New Document

1. Copy one supported `.md`, `.txt`, `.html`, or `.pdf` file into `rag-backend/docs`.
2. Run an authenticated `POST /api/reload`, or upload it through authenticated `POST /api/upload`.
3. Ask a question whose answer exists only in the new document.

Expected result:

- Only the new document is loaded, split, embedded, and added.
- Existing documents retain their current chunk IDs and embeddings.
- Retrieval can return content and citations from the new document.

#### Test 3: Update an Existing Document

1. Modify the contents of an already indexed test document without changing its filename.
2. Run an authenticated `POST /api/reload`.
3. Query for newly added text and for text removed from the document.

Expected result:

- The file fingerprint changes.
- Replacement chunks are embedded and added before obsolete chunks are deleted.
- New content is retrievable.
- Removed content is no longer retrieved from stale chunks.
- Unrelated documents are not re-embedded.

#### Test 4: Delete an Existing Document

1. Back up and then remove one test document from `rag-backend/docs`.
2. Run an authenticated `POST /api/reload`.
3. Query for content unique to the deleted document.

Expected result:

- All chunks associated with the deleted source key are removed.
- Other indexed documents remain unchanged.
- The deleted document is no longer returned by retrieval.

#### Test 5: Unchanged Reload Cost

1. Complete a successful reload.
2. Make no file or chunk-configuration changes.
3. Run another authenticated reload while monitoring OpenAI usage or embedding logs.

Expected result:

- Every indexed file with current fingerprint and chunk metadata is skipped.
- No new embedding calls or embedding costs are generated.
- Reload duration is limited mainly to scanning and hashing local files.

### Scanned PDF OCR Indexing

#### Test 1: Install OCR Requirements

1. Install the updated locked Python dependencies:

   ```powershell
   cd "E:\Pathway\AI Chat\Pathway-AI-Chatbot\rag-backend"
   uv sync
   ```

2. Use automatic OCR fallback:

   ```dotenv
   PDF_OCR_ENGINE=auto
   ```

3. Optionally install Tesseract and require it:

   ```dotenv
   PDF_OCR_ENGINE=tesseract
   TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
   ```

4. Configure the remaining OCR settings:

   ```dotenv
   PDF_OCR_ENABLED=true
   PDF_OCR_MIN_TEXT_CHARS=40
   PDF_OCR_DPI=200
   PDF_OCR_LANGUAGE=eng
   ```

Expected result:

- The backend imports PyMuPDF and the locked OCR dependencies.
- Automatic mode works without a system Tesseract installation.
- Explicit Tesseract mode works when `tesseract --version` succeeds or `TESSERACT_CMD` is valid.
- Normal text PDFs continue to use embedded text without OCR.

#### Test 2: Upload and Index a Scanned PDF

1. Start the backend.
2. Upload an image-only scanned PDF through authenticated `POST /api/upload`.
3. Wait for the incremental index synchronization to complete.
4. Ask a question using a distinctive sentence visible in the scanned document.

Expected result:

- The upload returns success.
- Pages without embedded text are rendered and processed by the configured OCR engine.
- OCR text is split into chunks and embedded in Chroma.
- The bot answers using the scanned content and returns a citation to the PDF page.
- Existing unchanged documents are not re-embedded.

#### Test 3: Mixed Text and Scanned PDF

1. Upload a PDF containing both selectable-text pages and scanned-image pages.
2. Run an authenticated reload.
3. Query for distinctive text from both page types.

Expected result:

- Selectable-text pages are indexed from native extraction.
- Only low-text pages invoke OCR.
- Both native and OCR page content are retrievable.
- OCR pages contain `ocr: true` metadata.

#### Test 4: Missing Tesseract

1. Set `PDF_OCR_ENGINE=tesseract`.
2. Temporarily remove Tesseract from PATH and unset `TESSERACT_CMD`.
3. Upload or reload an image-only scanned PDF.

Expected result:

- Indexing fails with a clear message explaining that the Tesseract executable is required.
- Existing indexed chunks remain intact.
- The scanned PDF is not falsely reported as successfully indexed.

## Test Safety

- Always back up `rag-backend/chroma_store` before testing migration, update, or deletion behavior against production-like data.
- Use test documents for delete and update cases.
- Do not expose `.env`, API keys, JWT secrets, or document contents in logs or commits.
- Run production migration during a low-traffic period because the first reload performs one full legacy re-index.

### 2026-06-06 16:56:46 +08:00 - EC2 Staging Validation and Production Release

Validated the `Sal` backend release on EC2 and moved the production PM2 process to the tested Python 3.12 environment.

Release preparation:

- Confirmed EC2 was on `Sal` commit `f60e63f`, which includes indexing/OCR commit `4a82300`.
- Recorded rollback commit `092f05c`.
- Backed up the production Chroma store, documents, environment file, prompt, and PM2 configuration.
- Added production `API_BASE=https://api.chat.pathway.training` so citations do not point to localhost.
- Installed the locked dependencies into an isolated `.venv-release-test` environment.
- Copied production documents and Chroma data into `/tmp/pathway-release-test` for staging tests.

Staging verification:

- Health returned HTTP 200 on port 8001.
- Missing and invalid JWTs were rejected with HTTP 401.
- The first copied-index migration returned HTTP 200 in about 60 seconds.
- A second unchanged reload returned HTTP 200 in about 0.64 seconds.
- Public and authenticated chat endpoints returned relevant answers.
- Citation URLs used the public HTTPS API.
- Native PDF text was present in Chroma with correct source metadata.
- Image-only PDF text was recognized by RapidOCR and stored with `ocr: true` and `ocr_engine: rapidocr`.
- Updating a same-name text document replaced the old indexed phrase without retaining stale content.
- Unsupported file uploads returned HTTP 400.
- A realistic ministry-policy document was retrieved correctly and cited by the chatbot.
- Staging files and temporary upload files were removed after testing.

Production cutover:

- Stopped the old Python environment and started PM2 with `.venv-release-test`.
- Saved the updated PM2 process definition.
- Production authenticated reload returned HTTP 200.
- The following unchanged reload completed in about 0.64 seconds.
- Public `https://api.chat.pathway.training/api/health` returned HTTP 200.
- Production Chroma stabilized at about 189 MB.

Operational findings:

- Existing malformed PDFs emit `Ignoring wrong pointing object` warnings, but indexing completes successfully.
- The 6.8 GB root filesystem was the main release risk.
- Removed the unused 424 MB Python environment, APT cache, and disabled Snap revisions.
- Remaining major storage consumers include the active 721 MB Python environment, 844 MB VS Code Server, production data, rollback backup, and the Ubuntu operating system.
- Expanding the root volume and reviewing the EC2 instance/support-plan costs remain recommended.

### 2026-06-06 16:56:46 +08:00 - Local Release Backup

- Downloaded the EC2 release backup to the Git-ignored `local-backups/ec2/20260606-063636` directory.
- Preserved the raw release terminal transcript under `local-backups/tests`.
- Verified all 90 downloaded files against EC2 using SHA-256.
- Verified size: 242,201,761 bytes (230.98 MiB).
- Added `local-backups/` to `.gitignore` because the archive contains the production `.env`, proprietary documents, and Chroma data.

### 2026-06-06 22:59:03 +08:00 - Priority 2 Backend Security

- Added a dedicated dashboard JWT capability requirement to document upload and index reload.
- Added configurable query-length validation and process-local per-client rate limiting for chat endpoints.
- Protected document downloads with bearer-token or authenticated citation-query access.
- Moved dashboard deployment host details to local environment configuration and kept process environment values authoritative.
- Added configuration validation and documented trusted-proxy handling without adding dependencies.
- Preserved all previously completed checks in `TEST_LOG.md` and added the new security verification cases as unchecked.
- Left the production ESM Apps update task open and documented its compatibility, rollback, maintenance, and post-update verification checklist.

Testing status:

- Static syntax and diff checks are run as part of this change.
- New behavioral security tests are intentionally pending in `TEST_LOG.md` for the next dedicated test session.

### 2026-06-06 23:27:53 +08:00 - Priority 2 Backend Security Test Run

Added reusable isolated test harnesses:

- `rag-backend/tests/test_backend_security.py` replaces the RAG pipeline with a stub and uses a temporary document directory.
- `dashboard/security.test.js` evaluates dashboard configuration in temporary directories without starting the dashboard listener.
- `dashboard/package.json` now provides `npm run test:security`.

Backend command:

```powershell
$env:UV_CACHE_DIR='E:\Pathway\AI Chat\Pathway-AI-Chatbot\.uv-cache'
$env:UV_PROJECT_ENVIRONMENT='E:\Pathway\AI Chat\Pathway-AI-Chatbot\.uv-security-env'
uv run --project rag-backend --python 'E:\Pathway\AI Chat\Pathway-AI-Chatbot\.uv-python\cpython-3.12.11-windows-x86_64-none\python.exe' python -m unittest discover -s rag-backend/tests -p 'test_backend_security.py' -v
```

Backend result:

- 6 test groups passed in 4.573 seconds on the final rerun.
- Dashboard-only upload/reload authorization passed.
- Normal WordPress authorization remained valid for `/api/ask` and invalid for index mutation.
- Query boundary, oversized-query rejection, and invalid startup configuration tests passed.
- Rate-limit allowance, HTTP 429, `Retry-After`, expiry, disable switch, client separation, and trusted-proxy behavior passed.
- Protected file bearer/query-token access, expired/insufficient token rejection, and traversal rejection passed.

Dashboard command:

```powershell
cd dashboard
npm.cmd run test:security
```

Dashboard result:

- 5 checks passed.
- The committed server source contains no public EC2 hostname.
- Local `.env` loading and process-environment precedence passed.
- Missing host configuration returned a clear error.
- Generated dashboard tokens contained both configured capabilities.

Test environment note:

- The existing `rag-backend/.venv` referenced a missing uv-managed Python installation.
- Python 3.12.11 was installed under the Git-ignored workspace `.uv-python` directory and a Git-ignored `.uv-security-env` was used for the test run.
- No proprietary documents, Chroma data, OpenAI calls, or production services were used.
- No application-code fix was needed because all behavioral checks passed.
- Production ESM Apps updates remain unchecked because they require advisory review, live-server access, a maintenance window, rollback confirmation, and explicit approval.

### 2026-06-07 10:50:38 +08:00 - Final Local Security Release Gate

Reran the current local release checks before moving to public HTTPS deployment testing.

Results:

- All 6 backend security test groups passed in 4.850 seconds.
- All 5 dashboard security configuration checks passed.
- Python and dashboard JavaScript syntax checks passed.
- The frontend TypeScript/Vite production build passed.
- `git diff --check` passed.
- Confirmed by source review that authenticated citation links preserve PDF page fragments and that active local dashboard document changes use authenticated backend calls.
- No application-code changes were required.

Online-only follow-up:

1. Test an authenticated WordPress citation through public HTTPS and confirm the PDF opens at the cited page.
2. Confirm the product decision for public-chat citations, which cannot open protected files without a token.
3. Test client rate-limit buckets through Nginx and verify whether `CHAT_TRUST_PROXY` should remain disabled.
4. Confirm PM2 uses one backend process because rate-limit state is process-local.
5. Verify approved and unapproved CORS origins.
6. Repeat health, authentication, reload, query limit, rate limit, file access, chat, and citation smoke tests over the public API.
7. Keep legacy remote dashboard controls locked until their SSH reload path is replaced or authenticated.

Expected result:

- Public HTTPS matches the locally verified security behavior.
- Nginx supplies trustworthy client identity without exposing port 8000 directly.
- Protected citations work for authenticated WordPress users.
- Disabled legacy dashboard deployment routes remain unreachable.

### 2026-06-07 10:57:33 +08:00 - Pre-EC2 Unchecked Test Run

Ran every remaining release check that can be reproduced without EC2, Nginx, PM2, or the live WordPress authentication plugin.

Completed:

- Added production-origin CORS allow/reject coverage.
- Added public and authenticated citation-access coverage.
- Added inline PDF and `#page=N` citation coverage.
- Added a dashboard remote-lock check proving HTTP 423 is returned before protected action logic runs.
- Confirmed WordPress Ask AI PHP syntax and iframe token wiring.
- Reran the frontend build and all Python, JavaScript, and PHP syntax checks.

Failure and fix:

- The new citation test found that `file://...pdf#page=N` could encode the page fragment into the filename and return HTTP 404.
- Updated backend citation normalization to split the fragment before quoting the filename, then append it to the normalized URL.
- The final backend suite passed all 7 groups in 4.306 seconds.
- The dashboard suite passed all 6 checks.

Remaining EC2-only tests:

1. Verify Nginx forwarding behavior and confirm port 8000 is not publicly reachable.
2. Confirm the PM2 backend process count and runtime command.
3. Verify the deployed WordPress plugin mints a JWT accepted by `/api/ask`.
4. Open a protected PDF citation through the deployed WordPress page.
5. Verify production CORS and all public HTTPS smoke tests.
6. Confirm the deployed backend rejects tokenless chat requests; public chat access was disabled locally on 2026-06-07.

Expected result:

- The deployment reproduces the locally verified authorization, CORS, rate-limit, and citation behavior.
- The authenticated PDF opens at the cited page.
- Public chat behavior matches the chosen access policy.

### 2026-06-07 11:21:57 +08:00 - Backend WordPress Authentication Boundary

Required the normal WordPress JWT capability on `/api/chat` in addition to `/api/ask`.

Security behavior:

- Missing or malformed tokens return HTTP 401.
- Valid tokens without `JWT_REQUIRED_CAP` return HTTP 403.
- Rejected requests do not reach retrieval or the LLM.
- Valid WordPress tokens continue to receive answers and authenticated citations.

Verification:

- All 8 backend security test groups passed in 4.890 seconds.
- Query length, rate limiting, CORS, PDF citations, file protection, dashboard authorization, and invalid configuration checks remained green.
- Frontend production build passed.
- Python and PHP syntax checks passed.
- `git diff --check` passed.

Follow-up tasks:

- Add the user-facing redirect from the hosted frontend to the Pathway login/access page.
- Add persistent daily per-user limits after the WordPress JWT supplies a stable user identifier.

Expected result:

- Navigating directly to `chat.pathway.training` without a valid WordPress JWT may load the UI temporarily, but no backend answer can be generated.
- Bypassing or modifying frontend code does not bypass backend authentication.

### 2026-06-07 12:25:42 +08:00 - Single Chat Endpoint and Token Ceilings

Consolidated chatbot traffic onto authenticated `/api/ask` and removed `/api/chat`.

Backend changes:

- Added `CHAT_INPUT_TOKEN_LIMIT` with a default of 2,000 estimated tokens.
- Estimated the current question plus the six recent messages before retrieval.
- Returned HTTP 422 without calling RAG when the estimate exceeds the limit.
- Added `LLM_MAX_OUTPUT_TOKENS` with a default of 1,200.
- Passed the response ceiling to OpenAI and Ollama using their supported settings.

Frontend changes:

- Removed the tokenless `/api/chat` fallback.
- Always sends a WordPress bearer JWT to `/api/ask`.
- Displays the estimated input size and maximum response budget.
- Disables Send when there is no token or the estimated input is over the limit.
- Added matching optional Vite environment settings.

Testing:

- All 9 backend security groups passed in 5.591 seconds on the final rerun.
- All 6 dashboard security checks passed.
- OpenAI and Ollama constructors retained the configured 1,200-token output cap.
- Frontend production build passed.
- Python compilation and `git diff --check` passed.
- The first backend run exposed an indentation error in the edited limiter block; it was corrected before the final passing run.
- Automated visual inspection was unavailable because the in-app browser could not start; the local preview remains available at `http://127.0.0.1:5173/`.

Remaining daily-limit work:

1. Confirm which stable user identifier the deployed WordPress JWT includes.
2. Choose durable shared quota storage.
3. Record actual or conservatively estimated usage by user and UTC day.
4. Reject requests before model execution when the remaining daily budget is insufficient.

Expected result:

- Only authenticated `/api/ask` requests reach RAG.
- Browser estimation provides immediate feedback, while backend enforcement cannot be bypassed.
- Model output is bounded even when a valid request produces a long answer.

### 2026-06-07 12:54:33 +08:00 - Remaining User Token Response

Added process-local daily token accounting to `/api/ask` and included `remaining_tokens` in every successful answer.

Behavior:

- Identifies users from configurable JWT claims, defaulting to `sub`, `user_id`, then `id`.
- Reserves estimated input plus maximum output before model execution.
- Rejects insufficient balances with HTTP 429 before retrieval or LLM work.
- Settles the reservation using estimated user-visible input and returned-answer tokens.
- Keeps separate balances per user and UTC date.
- Releases reservations when model execution or later response processing fails.

Configuration:

```env
CHAT_DAILY_TOKEN_LIMIT=100000
JWT_USER_ID_CLAIMS=sub,user_id,id
```

Testing:

- All 11 backend test groups passed in 8.646 seconds on the final rerun.
- All 6 dashboard security checks passed.
- Tests covered balance decrement, user isolation, missing identity, exhausted balance, failed-request rollback, UTC reset, and invalid configuration.
- Frontend production build passed after stopping the active Vite preview process.
- Syntax and diff checks passed.

Important limitation:

- The balance tracks estimated user-visible question/history and answer tokens.
- It is not exact provider billing usage because hidden prompt and retrieved-context tokens are not currently reported through the pipeline contract.
- Storage remains process-local, so balances reset on restart and are not shared across workers.

Frontend follow-up:

- Display `remaining_tokens` after successful answers.
- Handle quota-exhausted HTTP 429 responses with a clear user-facing state.

Expected result:

- Each successful `/api/ask` response exposes the user's remaining daily balance.
- Requests that cannot fit within the remaining budget never reach RAG or the model.

### 2026-06-07 13:12:05 +08:00 - Durable Quota and npm Security Completion

Completed the remaining repository-side Priority 2 backend security work.

Durable quota storage:

- Replaced process-local quota state with SQLite at `TOKEN_USAGE_DB`.
- Enabled WAL mode and atomic immediate transactions.
- Preserved balances across backend restarts and shared them across workers on the same server.
- Stored HMAC-derived user keys instead of raw WordPress identifiers.
- Added automatic cleanup for rows older than seven days.
- Ignored the generated `rag-backend/data` directory.

Concurrency and persistence tests:

- Reinitialized the database and confirmed the previous balance remained.
- Ran three concurrent reservations against a six-token balance.
- Exactly two reservations succeeded and one received HTTP 429.
- Confirmed the stored total never exceeded the configured limit.

Webapp npm dependency security:

- Reproduced advisories affecting Vite, Rollup, Picomatch, and PostCSS.
- Applied npm's non-breaking security fixes.
- Locked Vite 6.4.3, Rollup 4.61.1, Picomatch 4.0.4, and PostCSS 8.5.15.
- Allowed only `webapp/package-lock.json` through the repository lockfile ignore rule.
- Final npm audits reported zero vulnerabilities for webapp, dashboard, and backend Node packages.

Verification:

- All 12 backend security groups passed in 9.955 seconds.
- All 6 dashboard checks passed.
- Vite 6.4.3 production build passed.
- Python, JavaScript, PHP, and diff checks passed.

Remaining EC2 procedure:

1. Back up the current release and confirm disk space.
2. Pull the reviewed commit.
3. Identify, simulate, and apply the pending Ubuntu ESM Apps package updates.
4. Run `npm ci` in `webapp` when deploying the frontend lockfile.
5. Confirm the installed package versions and zero-vulnerability npm audit.
6. Verify the WordPress JWT identity claim and SQLite quota persistence.
7. Run staging and public HTTPS smoke tests before production cutover.

Expected result:

- Priority 2 repository changes are complete.
- The only remaining Priority 2 checkbox is the Ubuntu ESM Apps updates and release verification on EC2.

### 2026-06-07 13:28:47 +08:00 - Server-Side Conversation Continuity

Completed the Priority 4 backend conversation-context task.

Changes:

- Keyed process-local conversation state by the HMAC-derived authenticated user key and conversation ID.
- Added the latest prior user message as an explicit active topic for follow-up prompts.
- Reused recent successful server turns when frontend history is missing.
- Kept frontend-provided history as the preferred context when available.
- Counted the complete contextual prompt against input and daily token limits.
- Stored only successful turns and bounded both messages per conversation and total conversations.
- Added `CHAT_SERVER_HISTORY_MESSAGES` and `CHAT_MAX_SERVER_CONVERSATIONS`.

Verification performed:

- Backend syntax compilation passed.
- All 13 backend regression groups passed in 11.812 seconds on the final rerun.
- A same-user vague follow-up received its prior topic and assistant response.
- A different authenticated user could not read context by reusing the same conversation ID.
- Message trimming and oldest-conversation eviction passed.
- Invalid context-limit configuration failed startup.

### 2026-06-07 13:28:47 +08:00 - Production Storage Capacity Plan

Completed the Priority 4 backend storage assessment and planning task.

Decision:

- Deleting normal source documents or the active Chroma index would remove required production data and is not a sustainable capacity strategy.
- Repeated cleanup of test environments, package caches, and old backups is useful maintenance but cannot absorb long-term document/index growth.
- The simplest immediate option is expanding the root EBS volume to at least 20 GB.
- The preferred isolation option is attaching a dedicated expandable EBS data volume and configuring `DOCS_DIR`, `CHROMA_DIR`, and optionally `TOKEN_USAGE_DB` to use it.
- S3 source storage plus a managed vector database remains a future scaling option, not a small pre-release change.

Verification before deployment:

1. Run `df -h /` and `df -i /`.
2. Run `du -sh ~/Pathway-AI-Chatbot/rag-backend/docs ~/Pathway-AI-Chatbot/rag-backend/chroma_store ~/Pathway-AI-Chatbot/rag-backend/data 2>/dev/null`.
3. If expanding the root volume, confirm the new device and filesystem size with `lsblk` and `df -h /`.
4. If attaching a data volume, confirm it is mounted persistently, update the three paths in `.env`, restart staging, and verify health, ask, upload, reload, and quota persistence.

Optimal result:

- The production filesystem has at least 20% free space and at least 2 GB immediately available before indexing more documents.
- `docs`, `chroma_store`, and the quota database remain readable and writable after a restart.
- Uploading and reloading a test document increases only the expected data paths and does not fill the root filesystem.

### 2026-06-07 13:42:14 +08:00 - Final Local Pre-Push Release Gate

Ran the complete locally available release gate before committing the accumulated `Sal` changes.

Failed-first result and fix:

- The Vite production compilation succeeded, but `npm run build` returned a failure on Windows because the package script used the Unix-only `cp` command.
- Replaced the copy command with `webapp/scripts/copy-plugin-dist.mjs`, using only Node built-in filesystem APIs.
- The build now compiles the webapp and copies generated files into `plugin/dist` on Windows and Linux without adding a dependency.

Final verification:

- All 13 backend regression groups passed.
- All 6 dashboard security checks passed.
- The Vite 6.4.3 production build and plugin asset copy passed.
- Webapp, dashboard, and backend Node dependency audits each reported zero vulnerabilities.
- Backend Python and dashboard JavaScript syntax checks passed.
- WordPress plugin and Ask AI page PHP syntax checks passed.
- `git diff --check` passed.

Remaining production-only work:

- Expand or attach EC2 storage before substantial document growth.
- Apply and verify the reviewed Ubuntu ESM Apps updates.
- Run the documented EC2 staging, WordPress JWT, Nginx, PM2, quota-persistence, and public HTTPS smoke tests.

Optimal result:

- The reviewed commit can be pushed to `Sal` with no remaining locally executable test failures.
- Only infrastructure and live integration checks remain for deployment.

### 2026-06-07 16:58:09 +08:00 - Priority 3 and 5 Frontend Security

- Added a hosted-chat authentication gate for missing, malformed, expired, and incompatible-capability JWTs.
- Added redirect handling for backend HTTP 401 and HTTP 403 responses.
- Passed the WordPress access URL, required capability, and authentication requirement into the hosted iframe.
- Restricted configured redirects to HTTPS Pathway domains and local development hosts.
- Added display of the backend-provided daily token balance.
- Added request disabling when the estimated reservation exceeds the known remaining balance.
- Added distinct messages for exhausted and insufficient daily quota responses.
- Kept the subscriber-access task open because the JWT issuer is maintained outside this repository and its subscriber capability has not been confirmed.

Completed verification:

1. Run `cd webapp` and `npm.cmd run build`.
2. Run `php -l webapp/page-ask-ai.php`.

Result:

- Vite production compilation and local asset copy passed.
- The WordPress page template passed PHP syntax validation.
- The in-app browser could not initialize in this Windows sandbox, so no pending redirect, quota, or responsive behavior case was marked complete.

Pending behavioral steps:

1. Run the hosted app with `requireAuth=1` and the access URL set to a local test page.
2. Exercise missing, malformed, expired, insufficient-capability, and valid JWT cases.
3. Mock or run `/api/ask` responses for successful balances, quota HTTP 429 responses, and ordinary rate-limit HTTP 429 responses.
4. Verify the normal site-wide WordPress widget does not redirect when hosted-chat auth mode is absent.
5. Verify desktop and mobile layouts.
6. Confirm contributor and subscriber token claims in the deployed external WordPress issuer before changing the role requirement.

Optimal result:

- Invalid hosted-chat sessions return to WordPress without exposing a backend error.
- Valid sessions remain usable.
- Redirect configuration cannot leave trusted Pathway or local development hosts.
- The newest remaining balance is visible and daily quota exhaustion is clear.
- Subscriber access changes only after the live issuer proves the intended capability contract.

### 2026-06-07 17:17:23 +08:00 - Priority 3 and 5 Frontend Test Run

- Added `webapp/scripts/test-frontend-security.mjs` and the `test:frontend-security` npm command.
- Added `ws` as a development-only dependency for reliable Chrome DevTools communication; it is not included in the shipped frontend bundle.
- Ran the production build through an isolated local HTTP server, mock `/api/ask`, and headless Chrome.
- Passed 18 checks covering missing, malformed, expired, and insufficient-capability tokens; valid access; HTTP 401/403 redirects; widget isolation; redirect allowlisting; daily balance updates; quota responses; temporary rate limiting; and WordPress iframe parameters.
- Verified quota layout at 1440 x 900 and 390 x 844 with no horizontal overflow or composer overlap.
- Reran the Vite production build and PHP syntax validation successfully.
- Confirmed npm audit remains at zero vulnerabilities.

Failed-first test-harness corrections:

- Replaced Node's built-in WebSocket client with the test-only `ws` package after the Chrome DevTools socket disconnected.
- Disabled GPU and browser sandbox use only for the disposable headless test process after the Windows sandbox rejected the GPU subprocess.
- Waited for the typing animation to restore the enabled Send button before issuing a second request.
- Verified the trusted external fallback through Chrome network events because an offline external navigation ends on `chrome-error://`.

Remaining tests:

- Confirm the intended subscriber and denied-role behavior using the externally managed WordPress JWT issuer and live test accounts.
- Decide the final WordPress/backend capability only after those live claims are known.

Optimal result:

- Every locally reproducible Priority 3 and 5 test remains green.
- The only remaining frontend-security decision is based on verified live WordPress role and token behavior rather than an assumed capability.

### 2026-06-07 17:45:29 +08:00 - Localhost Send Regression

Issue:

- `localhost:5173` had no WordPress JWT, so the Send button remained disabled.
- The standalone Vite configuration also retained the live API URL.

Fix:

- Added Vite development middleware at `/__rag-dev-config`.
- Restricted the endpoint to loopback connections.
- Read the JWT secret and required capability from the ignored `rag-backend/.env`.
- Minted an eight-hour local JWT with a stable `local-development` identity for durable quota accounting.
- Loaded the local token automatically on `localhost` and `127.0.0.1`.
- Preferred the local API configuration over the standalone page's live default.
- Kept the endpoint out of production builds.

Verification:

- The Vite token endpoint returned a signed local token with `sub`, expiry, and `edit_posts`.
- Headless Chrome confirmed the localhost Send button becomes enabled.
- Clicking Send reached the configured local API with authentication and displayed the returned balance.
- All previous redirect, quota, and responsive checks still passed.
- Final frontend suite: 20 checks passed.
- Vite production build, PHP syntax, JavaScript syntax, npm audit, and `git diff --check` passed.

Optimal result:

- With the backend on port 8000 and Vite on port 5173, local chat sends successfully while production continues to require WordPress authentication.

### 2026-06-08 10:41:50 +08:00 - Priority 8 Frontend Interaction States

- Added an authentication-checking overlay and a separate backend-response waiting overlay.
- Added explanatory authorization states before hosted redirects and an immediate `Go to login` action.
- Replaced generic chat error bubbles with a dismissible failure notification dialog.
- Added destructive clear-chat confirmation with Cancel, close icon, backdrop click, Escape, and explicit confirmation.
- Kept clear-chat behavior frontend-only: it clears rendered/session history and starts a fresh conversation without resetting the displayed token balance.
- Did not add conversation summarization, summary UI, backend deletion, or token-reset behavior.
- Added the new browser test cases to `TEST_LOG.md` as unchecked for the next dedicated test run.

Static verification steps:

1. Run `cd webapp && npm.cmd run build`.
2. Run `node --check scripts/test-frontend-security.mjs`.
3. Run `git diff --check`.

Generated behavioral test command:

```powershell
cd webapp
npm.cmd run test:frontend-priority8
```

This command runs only the new Priority 8 cases and does not repeat the 20 previously completed frontend checks.

Pending behavioral verification:

1. Exercise every failure-dialog dismissal path and authorization redirect state.
2. Exercise every clear-chat confirmation and cancellation path.
3. Verify authentication and backend-waiting overlays on desktop and mobile.
4. Confirm clearing preserves `remaining_tokens` and does not call any backend summary or deletion endpoint.

Optimal result:

- Frontend users receive clear status and failure feedback.
- Destructive browser-history clearing always requires deliberate confirmation.
- All summarization-related work remains untouched and pending.

### 2026-06-08 11:22:31 +08:00 - Priority 8 Frontend Interaction Test Run

- Ran the dedicated production-bundle browser suite without repeating the 20 previously completed frontend checks.
- Passed 10 Priority 8 checks covering session explanations, backend authorization failures, failure-dialog dismissal, rate-limit messaging, loading overlays, clear-chat confirmation, token preservation, accessibility semantics, and mobile fit.
- Fixed missing-token messaging so an absent token requests login instead of claiming the session expired.
- Kept the Send button's `.send-button` class while busy so its disabled state and styling remain stable.
- Improved test isolation and verified that confirmed clearing removes messages, conversation ID, draft input, quota warning, and session history while preserving the latest token balance.

Failed-first results:

1. The initial waiting-state check could not find the busy Send button because its class was removed while busy.
2. The first clear-dialog run inherited prior scenario history from `sessionStorage`.
3. The expanded access-reason check exposed incorrect missing-token wording.
4. Transient authentication-overlay geometry required event-time capture and a persistent auth state for reliable mobile measurement.

Steps and instructions for testing:

1. From `webapp`, run `npm.cmd run build`.
2. Run `npm.cmd run test:frontend-priority8`.
3. Confirm the command reports `10 Priority 8 frontend checks passed`.
4. Run `node --check scripts/test-frontend-security.mjs`.
5. Run `npm.cmd audit --audit-level=high` and confirm zero vulnerabilities.
6. From the repository root, run `git diff --check`.

Optimal result:

- All local Priority 8 interaction checks pass.
- Missing, malformed, expired, and unauthorized sessions display distinct explanations.
- Clear confirmation cannot erase history accidentally and does not reset token usage.
- The only remaining case is the externally managed WordPress unauthorized-account round trip.

### 2026-06-08 12:53:48 +08:00 - Live WordPress Authentication 401 Diagnosis

Diagnosis:

- The screenshot shows `/api/ask` returning HTTP 401 after WordPress displayed the authenticated chat.
- `page-ask-ai.php` requires `edit_posts` before minting the token, while the backend returns HTTP 403 for an accepted JWT missing that capability.
- The observed response therefore indicates JWT validation failure rather than the wrong WordPress role. The most likely deployment cause is a signing-secret mismatch; token expiry is the other direct 401 path.

Changes:

- Changed backend HTTP 401 wording from `Session expired` to `Authentication failed`.
- Kept HTTP 403 wording as `Access denied`.
- Added separate expired-token and rejected-token explanations.
- Replaced iframe-local login navigation with a top-level link to `https://pathway.training/wp-login.php`.
- Extended the focused browser suite to verify the link URL and `_top` target.

Testing:

1. Run `cd webapp`.
2. Run `npm.cmd run build`.
3. Run `npm.cmd run test:frontend-priority8`.
4. Confirm all 10 checks pass.
5. Run `node --check scripts/test-frontend-security.mjs`.

Live deployment verification:

1. Compute a SHA-256 fingerprint of the backend `PATHWAY_RAG_JWT_SECRET` without displaying the secret.
2. Ask the owner of `pathway_rag_mint_current_user_token()` to compute the issuer secret's fingerprint the same way.
3. Confirm the fingerprints match.
4. Reload Ask AI to mint a fresh ten-minute token, send one message, and confirm `/api/ask` returns HTTP 200.
5. If it still returns HTTP 401, decode only the JWT payload locally and inspect `exp`, `cap`, and a configured identity claim. Never paste or log the complete token.

Backend test limitation:

- The focused backend unit test could not run because local `uv` and `.venv` point to a removed Python 3.12 installation and system Python lacks FastAPI.
- Existing test source covers the boundary: invalid JWT returns 401, a valid JWT with the wrong capability returns 403, and a valid `edit_posts` JWT returns 200.

Optimal result:

- A fresh live WordPress token receives HTTP 200.
- Wrong-role accounts are distinguishable through HTTP 403.
- The login link leaves the iframe and opens the WordPress login page.

### 2026-06-09 17:04:34 +08:00 - Public Edge-Test Partial Run

Reviewed the latest EC2 public API test transcript.

Completed:

- Production CORS allowed all configured origins and rejected an unapproved origin.
- Public malformed and expired JWT requests returned the expected HTTP 401 responses.

Failed test setup:

- Public character-limit, estimated-token-limit, and rate-limit requests used an empty or unavailable `$TOKEN`, so authentication correctly stopped them with HTTP 401 before the intended checks.
- The rate-limit test changed production configuration to three requests but did not restore it after authentication failed.

Required recovery and rerun:

1. Restore `.env.before-rate-limit-test`, restart PM2 with updated environment values, and verify the normal rate limit.
2. Mint a fresh one-hour EC2 test JWT and prove it with one authenticated public request.
3. Rerun character and token limits.
4. Temporarily set the rate limit to one request, verify the second request receives HTTP 429, then restore production configuration immediately.

Optimal result:

- Production returns to `CHAT_RATE_LIMIT_REQUESTS=100`.
- The remaining three tests execute through authenticated public HTTPS and produce HTTP 422, HTTP 422, and HTTP 429 respectively.

### 2026-06-10 22:54:49 +08:00 - Durable Conversation Summary And Self-History

Implemented:

- Replaced process-local conversation memory with durable SQLite state keyed by the existing anonymized user key.
- Kept one linear thread per user and added authenticated self-history loading.
- Retained the newest 12 completed exchanges as raw rows and summarized older exchanges into private cumulative memory.
- Added backend clear compaction that preserves summary context and never resets daily usage.
- Counted automatic and clear-triggered summarization against daily token balance.
- Warned users when the next message may trigger token-consuming automatic summarization.
- Kept summaries hidden from frontend responses.
- Left admin user search unimplemented while preserving a schema suitable for a later dashboard API.

Safety behavior:

- Raw messages are removed only in the transaction that saves a non-empty replacement summary.
- Failed or unaffordable clear requests preserve visible messages.
- Client conversation IDs cannot create or switch threads.

Static verification completed:

1. `python -m py_compile main.py rag.py tests/test_backend_security.py`
2. `node --check scripts/test-frontend-security.mjs`
3. `npm.cmd run build`
4. `git diff --check`

Generated tests, intentionally not run:

1. From `rag-backend`, run `python -m unittest tests.test_backend_security.BackendSecurityTests.test_durable_conversation_summary_history_and_clear_are_user_isolated -v`.
2. From `webapp`, run `npm.cmd run test:conversation-summary`.
3. Run the complete backend suite after the focused checks pass.

Optimal result:

- Refresh restores only the newest 12 exchanges for the authenticated user.
- The 13th completed exchange compacts the oldest exchange into private summary memory.
- Clear compacts visible messages, retains summary context, and charges but never resets quota.
- Summary or quota failure never removes raw history.

### 2026-06-10 23:49:02 +08:00 - Durable Summary And History Test Run

Results:

- Three focused backend conversation tests passed.
- All 15 backend security tests passed.
- All 3 conversation-summary frontend checks passed.
- All 10 Priority 8 frontend checks passed.
- All 20 frontend security checks passed.
- Production frontend build, Python syntax, JavaScript syntax, and diff checks passed.

Failed-first fixes:

1. The default system Python lacked FastAPI; tests now use the existing repository-local `.uv-security-env`.
2. A test query exceeded the suite's 12-character query limit and was shortened.
3. `reserve_daily_tokens()` captured the output-token cap at import time; it now reads the current configured value when called.
4. Legacy quota and input-limit tests were isolated from durable prior conversation context.
5. The old clear assertion now expects the stable thread ID returned by the one-thread API.
6. The old rate-limit check now verifies the sanitized notification dialog instead of raw backend text.
7. The Vite localhost check now waits for the enabled Send control instead of a redundant page-complete state.

Additional coverage:

- Verified exact 12-exchange retention and 13th-exchange compaction.
- Verified cumulative summary preservation and SQLite reinitialization.
- Verified empty and failed automatic summaries preserve raw messages.
- Verified empty clear is a no-op.
- Verified successful clear charges quota.
- Verified insufficient quota and clear-time model failure preserve history.

Optimal result:

- Every newly generated summary/history test is checked.
- Existing backend and frontend behavior remains green.

### 2026-06-12 17:45:11 +08:00 - Durable Summary And History Audit

Implemented:

- Audited the committed backend, frontend, tests, and deployment notes for the durable one-thread conversation feature.
- Added a process-local lock per anonymized user so simultaneous sends, or a send racing with clear, cannot overwrite a cumulative summary or compact stale message rows in the current single-worker deployment.
- Added a delayed-summary concurrency regression test.
- Improved the final localhost browser-test failure message with the current page and button state.

Testing steps:

1. From `rag-backend`, run `..\.uv-security-env\Scripts\python.exe -m unittest tests.test_backend_security.BackendSecurityTests.test_concurrent_same_user_requests_preserve_summary_order -v`.
2. From `rag-backend`, run `..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v`.
3. From `webapp`, run `npm.cmd run test:conversation-summary`.
4. From `webapp`, run `npm.cmd run test:frontend-priority8`.
5. From `webapp`, run `npm.cmd run test:frontend-security`.
6. From `webapp`, run `npm.cmd run build`.
7. Run `git diff --check` from the repository root.

Optimal result:

- Concurrent requests for one user are serialized and preserve the cumulative summary.
- Different users remain independent because locks are keyed by anonymized user identity.
- All 16 backend tests, 3 summary frontend checks, 10 Priority 8 checks, and 20 frontend security checks pass.
- The production frontend build and static checks pass.
- Continue running one backend PM2 process until distributed locking is implemented.

### 2026-06-12 18:10:23 +08:00 - Infrastructure, Input Limit, And Citation Security Audit

Implemented:

- Confirmed the current tracked tree contains no former public EC2 address and no tracked PEM or private-key file.
- Confirmed the backend already rejects chat queries over 4,000 characters and rejects estimated question-plus-history input over 2,000 tokens before retrieval or model execution.
- Added a matching configurable 4,000-character frontend textarea limit for earlier user feedback.
- Replaced full chat JWTs in citation URLs with HMAC-signed tickets limited to one filename and 900 seconds by default.
- Kept source titles, filenames, PDF page fragments, and authenticated bearer-header file access.
- Stored canonical citation URLs without expiring tickets and issued fresh tickets in Ask and history responses.
- Added no-store and no-referrer response headers for protected files.
- Added `.pem` and `.key` ignore rules.

Git history finding:

- Older commits still contain the former public EC2 IP and hostname even though the current tree is clean.
- Complete removal from GitHub requires a coordinated history rewrite and force-push of affected branches and tags. This was not performed automatically because it changes commit hashes for every collaborator.
- Treat the server address as public metadata and rely on SSH allowlisting, closed direct backend ports, authentication, and security groups rather than address secrecy.

Testing steps:

1. From `rag-backend`, run `..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v`.
2. From `dashboard`, run `npm.cmd run test:security`.
3. From `webapp`, run `npm.cmd run test:conversation-summary`.
4. From `webapp`, run `npm.cmd run test:frontend-priority8`.
5. From `webapp`, run `npm.cmd run test:frontend-security`.
6. From `webapp`, run `npm.cmd run build`.
7. Search the current tracked tree for the former host and confirm no `.pem` or `.key` files are tracked.
8. Open a cited PDF and confirm the filename and page reference remain visible while the URL contains `file_token`, not the chat JWT.

Optimal result:

- Oversized character and estimated-token requests are stopped before retrieval or LLM work.
- Citation links open the referenced file but cannot authorize chat requests or another filename.
- Expired or altered file tickets return HTTP 401.
- The current tracked source contains no public deployment address or private key.
- Git history scrubbing is performed only after collaborator coordination and a backup.

### 2026-06-13 16:43:42 +08:00 - EC2 Storage And Persistent PM2 Recovery

Implemented:

- Removed obsolete and incomplete VS Code Server data plus safe package and journal caches, reducing root usage from 98% to 81% and restoring approximately 1.3 GB free space.
- Confirmed the EBS device remains 8 GB and cannot be grown until the AWS volume is expanded.
- Restored the saved `rag-backend` PM2 process after reboot.
- Enabled and started `pm2-ubuntu.service` so the saved process is resurrected during system startup.

Testing steps:

1. Run `df -h /` and confirm approximately 1.3 GB remains available.
2. Run `systemctl is-enabled pm2-ubuntu` and `systemctl is-active pm2-ubuntu`.
3. Run `pm2 status` and confirm one `rag-backend` process is online.
4. Run `curl -fsS http://127.0.0.1:8000/api/health`.
5. Run `curl -fsS https://api.chat.pathway.training/api/health`.

Optimal result:

- The service is enabled and active, the backend is online on loopback, and both health requests return `{"status":"ok"}`.
- Root usage remains below the emergency threshold; expand the EBS volume before substantial document growth.

### 2026-06-13 16:43:42 +08:00 - Reliable Citation Markers And Source Links

Implemented:

- Fixed backend citation finalization so retrieved citations are not trimmed to an empty list when the model omits inline `[n]` markers.
- Retained the existing backend fallback that adds citation markers to factual sentences.
- Added a visible linked Sources list below every AI answer that contains citation metadata.
- Added a browser regression for an answer that returns a protected PDF citation without an inline marker.

Testing steps:

1. From `rag-backend`, run `python -m py_compile rag.py main.py`.
2. From `rag-backend`, run `..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v`.
3. From `webapp`, run `npm.cmd run build`.
4. From `webapp`, run `npm.cmd run test:frontend-security`.
5. After deployment, ask a question that retrieves a source document and inspect the answer plus Sources list.
6. Open the source link and confirm the filename is visible, the URL uses a short-lived `file_token`, and any `#page=N` fragment is preserved.

Optimal result:

- The backend returns citations even when the model initially omits markers.
- The frontend displays linked `[n]` references and a Sources list without exposing the reusable chat JWT.
- The backend suite passes all 16 tests. The citation browser regression passes; the complete browser suite still needs a clean rerun after its unrelated final Vite localhost fixture timeout.

### 2026-06-13 17:30:57 +08:00 - Complete Local Release Verification

Implemented:

- Ran every unchecked test that can be reproduced without EC2, AWS, Nginx, or a genuine WordPress JWT.
- Changed the final frontend security check to use the real Vite-minted local token on the stable test page instead of depending on cross-origin Vite HMR page navigation.
- Audited the current npm dependency tree. npm now reports three high-severity development-tool findings and requires a Vite 8 major upgrade.
- Attempted the Vite 8 upgrade, but did not retain it because the required Windows Rolldown binary was repeatedly truncated during download and the dev server could not be verified.

Testing steps:

1. From `rag-backend`, run `..\.uv-security-env\Scripts\python.exe -m unittest discover -s tests -p "test_backend_security.py" -v`.
2. From `dashboard`, run `npm.cmd run test:security`.
3. From `webapp`, run `npm.cmd run test:conversation-summary`.
4. From `webapp`, run `npm.cmd run test:frontend-priority8`.
5. From `webapp`, run `npm.cmd run test:frontend-security`.
6. From `webapp`, run `npm.cmd run build`.
7. Run the Python, JavaScript, and PHP syntax checks documented in `TEST_LOG.md`.
8. Run `npm.cmd audit --audit-level=moderate` and track the Vite 8 migration separately.
9. Run `git diff --check`.

Optimal result:

- 16 backend tests, 6 dashboard checks, 3 summary checks, 10 Priority 8 checks, and 21 frontend security checks pass.
- The production build and all syntax checks pass.
- Remaining unchecked tests are limited to genuine production authentication, public API controls, Ubuntu maintenance, EBS capacity, and the separately tracked Vite 8 upgrade.

### 2026-06-13 18:39:34 +08:00 - Responsive Chat Layout

Implemented:

- Replaced viewport-width root sizing and the fixed 900-pixel composer minimum with width-constrained flex sizing.
- Kept the chat log as the internal scroll area so intermediate desktop dimensions do not create a page-level horizontal scrollbar.

Testing steps:

1. From `webapp`, run `npm.cmd run test:ui`.
2. Inspect 1024 x 768, 1366 x 768, and 390 x 844 viewports.

Optimal result: document width never exceeds viewport width and the composer remains fully visible.

### 2026-06-13 18:39:34 +08:00 - Chat Information And Clear Controls

Implemented:

- Replaced the header nuke icon with an accessible information icon.
- Moved answer guidance and token usage into a three-section information dialog.
- Added a 2x2 token grid and retained the known daily balance as supporting information.
- Moved clear history into a full-width red action and layered its existing confirmation above the information dialog.

Testing steps:

1. Open the information icon and inspect all three sections.
2. Select Clear chat history, then test Cancel, close, backdrop, Escape, and successful confirmation.
3. Confirm Cancel returns to information and successful clear closes both dialogs.

Optimal result: the destructive action is no longer exposed as an unexplained header icon, and both dialogs remain accessible and correctly layered.

### 2026-06-13 18:39:34 +08:00 - Proactive Daily Token Warning

Implemented:

- Kept Send available when a daily balance is known, then intercepted the action before `/api/ask` when the estimated input-plus-output reservation exceeds that balance.
- Added a dialog showing the estimated reservation and remaining balance, with guidance to shorten the request or wait for reset.

Testing steps:

1. Establish a remaining balance below the current estimated reservation.
2. Enter a message and select Send.
3. Confirm the daily-limit dialog opens and no `/api/ask` request is made.

Optimal result: the user receives a clear warning before network transmission and the message remains available to shorten.

### 2026-06-13 19:11:14 +08:00 - Inline Response Loading State And UI Regression Run

Implemented:

- Removed the full-screen response waiting overlay while preserving the separate authentication-checking screen.
- Replaced animated Thinking text with a compact spinner inside the disabled Send button.
- Added an accessible `Waiting for response` label and kept the Send button width stable.
- Updated browser checks to confirm the chat remains visible, duplicate sends remain blocked, and the spinner clears after completion.

Testing completed:

1. `npm.cmd run build` passed.
2. `npm.cmd run test:ui` passed 4 checks.
3. `npm.cmd run test:frontend-priority8` passed 10 checks after correcting old helper call signatures.
4. `npm.cmd run test:conversation-summary` passed 3 checks.
5. `npm.cmd run test:frontend-security` passed 21 checks.

Optimal result:

- Users can read and track the current chat while waiting.
- Send remains disabled and shows a visible, accessible loading animation.
- Existing authentication, clear, summary, quota, citation, responsive-layout, and localhost behavior remains green.

### 2026-06-13 20:09:23 +08:00 - Bold Backend Text And Pending Response Bubble

Implemented:

- Added safe rendering for balanced `**text**` spans without using raw HTML.
- Added a transient AI response bubble with a loading spinner immediately after send.
- Replaced the pending bubble in place with the complete answer when the backend responds and removed it on request failure.
- Excluded pending placeholders from browser session persistence.
- Verified failed requests remove the pending bubble before displaying their error dialog.

Testing completed:

1. Production build and JavaScript syntax checks passed.
2. `npm.cmd run test:ui` passed 5 checks.
3. `npm.cmd run test:frontend-priority8` passed 10 checks.
4. `npm.cmd run test:conversation-summary` passed 3 checks.
5. `npm.cmd run test:frontend-security` passed 21 checks.

Optimal result:

- Bold text and citations can coexist safely.
- The user sees a loading AI bubble immediately, followed by the answer in the same bubble.
- No pending placeholder survives refresh or a failed request.

### 2026-06-13 21:51:18 +08:00 - Non-Dashboard Task Audit

Reviewed every unchecked `TASKS.md` item outside Priority 6 against the current source, Git history, test records, production notes, and dependency audit.

Closed:

- Rechecked the webapp dependency tree with `npm.cmd audit --audit-level=high`.
- The installed Vite 6.4.3 tree now reports zero vulnerabilities.
- The earlier security-driven Vite 8 migration is no longer necessary; a future major upgrade is ordinary maintenance rather than an active security task.

Still open:

- Ubuntu ESM Apps updates require live package/advisory review, rollback preparation, a maintenance window, and production verification.
- Git history still contains the former EC2 address. Removal requires coordinated force-pushes and collaborator resets; cleaning the current tree did not rewrite prior commits.
- Hosted WordPress access control exists for `edit_posts`, but intended subscriber capability and token acceptance remain unverified because the issuer is external to this repository.

Optimal result:

- Only tasks with current implementation or direct verification evidence are checked.
- External and destructive operational work remains explicitly open.

### 2026-06-13 22:00:10 +08:00 - External Security Task Follow-Up

- Recorded the owner's confirmation that live WordPress subscriber/token verification is complete.
- Clarified that making the GitHub repository private does not remove existing clones, forks, or cached history.
- Retained the Git-history item as an optional decision because the old EC2 address is public metadata and no tracked private key or credential was found.
- Kept Ubuntu ESM Apps maintenance open because it requires authenticated production shell access, package-specific review, and a rollback window.

Optimal result:

- The WordPress verification task is closed without inventing external issuer details.
- Git history is rewritten only if a real secret is discovered or the team accepts the collaboration disruption.
- The Ubuntu ESM Apps updates are applied manually on EC2 after a snapshot and dry run, then production health is verified.

### 2026-06-13 22:06:49 +08:00 - Ubuntu ESM Package Discovery

Reviewed the production terminal transcript.

- Root storage has 1.2 GB available at 83% usage.
- Ubuntu Pro is available but the instance is not attached to a subscription.
- `pro security-status --esm-apps` reports five pending updates rather than the previously recorded three.
- The reported packages are `node-lodash`, `node-lodash-packages`, `python3-pip`, `python3-pip-whl`, and `python3-wheel`.
- A normal `apt update` succeeded and reported 69 total upgradable packages; a broad `apt upgrade` is outside this focused maintenance task.
- Installation remains pending until Ubuntu Pro is attached, ESM target versions become visible, and a package-specific simulation is reviewed.

Optimal result:

- Attach Ubuntu Pro without exposing the subscription token in project logs.
- Simulate and install only the five reviewed ESM packages.
- Reboot only if required and verify PM2 plus local/public backend health afterward.

Follow-up:

- `sudo pro status` confirmed that the production instance remains unattached.
- The interactive attachment was canceled because no organization-approved Ubuntu Pro account is currently available.
- No Ubuntu Pro service or ESM package was enabled, installed, or changed.
- Maintenance is deferred until Pathway provides or approves the subscription.

### 2026-06-15 17:16:36 +08:00 - Local And EC2 Dashboard Document Targets

Restored the dashboard's SSH-backed EC2 document workflow without changing the production backend API.

- Added an explicit Local/EC2 segmented control to the document card.
- Kept local upload and deletion on the authenticated backend upload/reload APIs.
- Added EC2 document listing, upload, and deletion through the existing SSH/SFTP configuration.
- Restarted the EC2 `rag-backend` PM2 process after remote upload or deletion so the document index reloads.
- Rejected unsupported targets, unsafe filenames, and unsupported file extensions before remote file operations.
- Removed the disabled remote-feature card, modal, prompt-sync notice, and their unused browser handlers.
- Left dashboard login, HTTPS migration, prompt synchronization, environment switching, and standalone PM2 controls for later tasks.

Verification completed:

1. Dashboard server, security test, and inline browser JavaScript syntax checks passed.
2. `npm.cmd run test:security` passed all 8 configuration and validation checks.
3. A temporary dashboard process returned HTTP 200 for the root and local document list.
4. An invalid document target returned HTTP 400.
5. EC2 mode without local SSH configuration returned a clear HTTP 500 configuration error instead of attempting an implicit fallback.

### Steps And Instructions For Testing

1. Create `dashboard/.env` from `dashboard/.env.example` and set the EC2 SSH host, user, PEM path, and remote project root.
2. From `dashboard`, run `npm start`, then open `http://localhost:3131`.
3. Keep the document target on Local, upload a disposable supported file, refresh the list, and delete it.
4. Switch the document target to EC2. The heading and helper text should identify EC2, and the list should show `/home/ubuntu/Pathway-AI-Chatbot/rag-backend/docs`.
5. Upload a uniquely named disposable file in EC2 mode.
6. On EC2, confirm the file exists in `rag-backend/docs` and `pm2 status` shows `rag-backend` online after the automatic restart.
7. Delete the disposable file from the EC2 list and confirm it disappears from both the dashboard and the server directory.
8. Ask a question that would retrieve the disposable document before deletion and repeat after deletion to confirm the remote index follows the file changes.

Optimal result:

- Local and EC2 lists never mix.
- Every request carries the currently selected target.
- EC2 operations require the configured SSH key and never expose it to the browser.
- Supported uploads appear after the PM2 restart, deleted files stop being retrieved, and `rag-backend` remains online.

### 2026-06-15 18:36:17 +08:00 - Dashboard SSH Configuration Repair

Resolved the local dashboard error `PATHWAY_SSH_HOST is not configured` and completed the EC2 read-only connection check.

- Confirmed `dashboard/.env` was missing rather than the PEM file.
- Created the ignored local environment file with the operator's SSH host, user, PEM path, and remote project root.
- Confirmed the configured PEM file already existed outside the repository and did not need to be moved.
- Restricted the Windows PEM ACL to the current user, Administrators, and SYSTEM after OpenSSH rejected broader group access.
- Restarted the dashboard so the new environment values were loaded.
- Verified the PEM with a direct SSH handshake.
- Verified the restarted dashboard listed EC2 documents successfully through its own SSH/SFTP route.
- Kept the actual EC2 address, private key, and local `.env` out of tracked files.

Optimal result:

- EC2 mode no longer reports a missing SSH host.
- OpenSSH accepts the PEM without an unprotected-key warning.
- The dashboard can list remote documents while Git continues to ignore `.env` and PEM files.

### 2026-06-15 18:32:48 +08:00 - Dashboard Process Controls, Frontend Output, And Document Search

Expanded the local dashboard controls while preserving the existing launch and document-management behavior.

- Added individual Stop buttons for dashboard-launched backend and frontend process trees.
- Added a validated `POST /api/local/stop/:service` route that refuses unknown service names.
- Kept unmanaged processes safe: the dashboard enables Stop only for child processes it launched and currently tracks.
- Captured bounded frontend stdout/stderr separately from backend output.
- Removed terminal color escape sequences before showing CLI output in the browser.
- Added separate backend and frontend output consoles with manual refresh and automatic polling.
- Added a filename search field above the document controls.
- Search filters the already loaded Local or EC2 document list in memory and does not trigger extra SSH requests.

Verification completed:

1. Dashboard server, security test, and inline browser JavaScript syntax passed.
2. Dashboard security configuration suite passed all 9 checks.
3. Invalid stop service names returned HTTP 400.
4. An already-stopped tracked service returned success with `stopped: false`.
5. The dashboard launched Vite, reported it ready, captured five frontend output lines, stopped its process tree, and reported it stopped.
6. The dashboard launched Uvicorn, received HTTP 200 from `/api/health`, captured backend output, stopped its process tree, and reported it stopped.
7. `git diff --check` passed.

### Steps And Instructions For Testing

1. Run `npm start` from `dashboard` and open `http://localhost:3131`.
2. Click Launch Backend. Confirm its status reaches Ready, its output console shows Uvicorn startup lines, and Stop becomes enabled.
3. Click Stop for Backend. Confirm port 8000 closes, the status returns to Stopped, and Launch Backend becomes available.
4. Repeat the launch/stop workflow for Frontend. Confirm its output console shows the Vite URL and port 5173 closes after Stop.
5. Switch the document target between Local and EC2 and confirm the search field clears when the target changes.
6. Enter a partial filename with mixed letter casing. Confirm only matching documents remain visible.
7. Enter a value with no matches. Confirm the list shows a no-match message without changing or deleting documents.
8. Clear the search field and confirm the full previously loaded list returns without another visible loading state.

Optimal result:

- Only processes launched by the current dashboard instance can be stopped.
- Backend and frontend output remain separate and readable.
- Search is case-insensitive, affects only the selected environment, and performs no file mutation or additional SSH request.

### 2026-06-16 15:48:06 +08:00 - Pending Dashboard Browser Test Run

Ran the locally reproducible unchecked dashboard tests before starting new implementation work.

Completed:

- `npm.cmd run test:security` passed all 9 dashboard security checks.
- `npm.cmd run test:ui` passed all 5 frontend UI checks.
- A temporary dashboard server was started at `http://127.0.0.1:3131/`.
- Headless Chrome verified Local is the initial document target, EC2 switching updates the active button, title, helper text, and file list, and the configured SSH route loads 55 EC2 documents.
- Headless Chrome verified Stop buttons follow launched, ready, and stopped UI states.
- Headless Chrome verified backend and frontend output consoles stay separate and scroll to the newest line.
- Headless Chrome verified document search is case-insensitive, no-match copy appears, clearing the query restores the cached list, and switching targets clears search.

Not executed:

- EC2 document upload, retrieval, and deletion were not run because they mutate production files.
- Local `TASKS.md` did not contain any unchecked Priority 8 items at the time of this run. A `git fetch origin --prune` attempt failed with a GitHub connection reset, so implementation is waiting on the missing task text or a successful fetch.

### Steps And Instructions For Testing

1. From `dashboard`, run `npm.cmd run test:security`.
2. From `webapp`, run `npm.cmd run test:ui`.
3. Start the dashboard with `node server.js`.
4. Open `http://127.0.0.1:3131/` in a browser.
5. Confirm Local is active by default and the Stop buttons are disabled before launching services.
6. Switch to EC2 and confirm the heading, helper text, active control, and document list change together.
7. Search for part of a known filename using different casing and confirm only matching filenames remain.
8. Clear the search field and confirm the full cached list returns.
9. Switch back to Local and confirm the search field is cleared.

Optimal result:

- Local dashboard tests pass without mutating production documents.
- EC2 read-only listing works through the configured SSH route.
- Production document upload/delete tests remain explicit, approved live operations.

### 2026-06-16 16:41:39 +08:00 - Priority 8 Token, Iframe, And Dashboard Branch Sync

Completed the new unchecked Priority 8 tasks.

- Added an always-visible daily balance row to the frontend information dialog.
- Adjusted the WordPress Ask AI iframe template and chat root sizing so the hosted chat can fit the page height without relying on a fixed inherited height.
- Added dashboard controls to check the active EC2 Git branch, sync local `rag-backend/prompt.txt` to that active checkout, and optionally commit/push prompt changes to the same active branch.
- Kept branch selection server-side: the browser never sends a branch name.

Verification completed:

1. `node --check dashboard/server.js`
2. `node --check dashboard/security.test.js`
3. `node --check scripts/test-frontend-security.mjs`
4. `php -l webapp/page-ask-ai.php`
5. `cd dashboard && npm.cmd run test:security` - 13 checks passed.
6. `cd webapp && npm.cmd run build`
7. `cd webapp && npm.cmd run test:ui` - 5 checks passed.
8. `cd webapp && npm.cmd run test:frontend-priority8` - 10 checks passed.
9. `cd webapp && npm.cmd run test:conversation-summary` - 3 checks passed.
10. `cd webapp && npm.cmd run test:frontend-security` - 21 checks passed.

### Steps And Instructions For Testing

1. Open the chat app and click the information button.
2. Confirm the token section shows `Daily balance` even before sending a message.
3. Send a successful message and reopen the information dialog.
4. Confirm the daily balance updates to the backend-provided remaining token value.
5. Load the WordPress Ask AI page and confirm the iframe fills the page height without an extra page-level scrollbar.
6. Open the local dashboard, click `Check EC2 Branch`, and confirm it shows the active branch and short commit.
7. Save a prompt locally, then click `Sync Prompt to EC2` only when an intentional live prompt update is desired.
8. To commit and push a prompt update, check the commit/push option, enter a one-line commit message, then sync.

Optimal result:

- The info dialog always communicates daily token balance state.
- The WordPress-hosted iframe fits the visible page cleanly.
- Prompt sync targets the EC2 checkout's active branch, and optional commit/push cannot run without a commit message.

### 2026-06-16 17:12:41 +08:00 - Hosted Ask AI Scroll Regression Fix

Fixed the WordPress-hosted chat layout regression shown in the screenshot.

- The WordPress Ask AI template now hides parent page overflow and sizes the iframe to account for the WordPress admin bar.
- The chat card is a fixed-height flex column; the header and composer stay in place while only the message log scrolls.
- Loaded history now performs a deferred scroll-to-bottom after render so users land at the newest message.
- The older fixed `380px` message-log height override was replaced with a flexing internal scroll region.

Verification completed:

1. `node --check scripts/test-frontend-security.mjs`
2. `php -l webapp/page-ask-ai.php`
3. `cd webapp && npm.cmd run build`
4. `cd webapp && npm.cmd run test:ui` - 6 checks passed.
5. `cd webapp && npm.cmd run test:conversation-summary` - 3 checks passed.
6. `cd webapp && npm.cmd run test:frontend-priority8` - 10 checks passed after rerunning sequentially.
7. `cd webapp && npm.cmd run test:frontend-security` - 21 checks passed.

Test note:

- The first Priority 8 command was started in parallel with the summary test and failed with `EADDRINUSE` on the shared browser-test port. Running the suite sequentially passed without code changes.

### Steps And Instructions For Testing

1. Open the WordPress Ask AI page while logged in.
2. Confirm the right side of the browser shows only the page/browser scrollbar, not a second iframe/chat scrollbar beside it.
3. Load a conversation with enough messages to overflow the chat area.
4. Confirm the newest messages and composer are visible after load.
5. Scroll the chat history upward.
6. Confirm the Pathway logo and information button remain visible at the top of the chat area.

Optimal result:

- The parent page does not scroll independently from the chat iframe.
- The chat history opens at the bottom.
- Long answers scroll inside the chat log while the topbar and composer remain available.

### 2026-06-16 17:36:18 +08:00 - Ask AI Measured Height Follow-Up

Removed the hard-coded WordPress admin-bar height subtraction from the Ask AI page template.

- The template now measures the actual available height from `.askai-wrap`'s top position and the current viewport height.
- The measured value is written to `--askai-available-height`, which the iframe wrapper uses with a `100dvh` fallback.
- The frontend security suite now checks that the template uses measured height and does not include the old fixed admin-bar pixel values.

Verification completed:

1. `php -l webapp/page-ask-ai.php`
2. `node --check scripts/test-frontend-security.mjs`
3. `cd webapp && npm.cmd run build`
4. `cd webapp && npm.cmd run test:ui` - 6 checks passed.
5. `cd webapp && npm.cmd run test:frontend-security` - 21 checks passed.

### Steps And Instructions For Testing

1. Open the WordPress Ask AI page while logged in.
2. Confirm the page does not show both a parent page scrollbar and a chat scrollbar on the right.
3. Resize the browser window and confirm the chat iframe continues to fit the visible area.
4. Scroll a long chat history and confirm only the chat history region scrolls.

Optimal result:

- The iframe height adapts to the actual WordPress layout without fixed admin-bar constants.
- The outer WordPress page does not add an extra vertical scrollbar.
