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
