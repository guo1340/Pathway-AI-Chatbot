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

## Steps and Instructions for Testing

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
