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
