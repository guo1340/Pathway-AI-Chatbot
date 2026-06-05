# TASKS.md

## Current Upgrade Goal

Improve the chatbot's backend architecture and security before expanding frontend, dashboard, or visual features.

## Priority 1: Backend Structure Redo

- [x] Replace fixed-size document chunking with content-aware chunking that keeps chunks within configurable minimum and maximum sizes.
- [x] Implement incremental document indexing so uploads embed only new or changed documents instead of rebuilding the entire Chroma index. Review whether the current vector-store metadata and document identifiers must change to support safe updates and deletions.

## Priority 2: Backend Security

- [ ] Secure `/api/upload` and `/api/reload` with dashboard-only authentication. Coordinate branch consolidation with the other developer before implementation.
- [ ] Add rate limiting to `/api/chat` and `/api/ask` to prevent automated abuse and uncontrolled OpenAI costs.
- [ ] Add a maximum chat-query length and reject oversized requests before they reach retrieval or the LLM.
- [ ] Protect `/api/files/{name}` so proprietary documents cannot be downloaded by guessing filenames while keeping authenticated citation links usable.
- [ ] Remove the public EC2 hostname from `dashboard/server.js` and load deployment details from environment variables or local configuration.
- [ ] Apply the three pending ESM Apps security updates on the production server after checking compatibility and creating a rollback plan.

## Priority 3: Frontend Security

- [ ] Restore login-based access control for `chat.pathway.training`. First confirm with the other developer that WordPress token injection works for subscriber accounts so legitimate users are not locked out.

## Priority 4: Backend

- [ ] Add server-side conversation state or conversation summarization that tracks the active topic and includes it in later prompts, allowing vague follow-ups such as "give me its history" to resolve correctly.
- [ ] Reduce production disk usage and plan storage capacity for 500+ documents and the growing Chroma database. The server currently has about 6.71 GB total storage and was reported as 76% full.

## Priority 5: Frontend

- No frontend feature tasks are currently listed.

## Priority 6: Dashboard

- [ ] Complete the operations dashboard for switching between local and live environments, managing bot documents, editing prompts and rules, and controlling the bot.
- [ ] Replace SSH-based document management, prompt synchronization, and backend restart operations with authenticated HTTPS backend APIs so dashboard access does not depend on the operator's IP address.
- [ ] Add dashboard authentication before allowing access beyond the current local machine. The dashboard can upload and delete documents, edit prompts, and run git commands.

## Priority 7: UI

- No UI-specific tasks are currently listed.

## In Progress

- Current task: None. Priority 1 backend structure work is complete.

## Done

- [x] Added configurable content-aware chunk sizing with small-chunk merging.
- [x] Added fingerprint-based incremental indexing for new, changed, and deleted files.
- [x] Added OCR fallback so uploaded scanned PDFs can be converted into text chunks and indexed.

## Notes for Codex

- Work from the highest-priority section downward unless the user explicitly changes the order.
- Keep security and architecture changes small and reviewable.
- After each completed change, update its checkbox and note the next recommended task.
- Add a separate timestamped entry to `LOG.md` for every completed task.
- Add detailed testing steps and expected results to the matching `LOG.md` entry.

## Work Log

- Full timestamped history: [`LOG.md`](LOG.md#work-log)
- 2026-06-05 17:27:47 +08:00 - Completed content-aware document chunking.
- 2026-06-05 17:27:47 +08:00 - Completed incremental document indexing.
- 2026-06-05 20:20:53 +08:00 - Completed scanned PDF OCR indexing support.
- 2026-06-05 21:27:35 +08:00 - Ran all documented tests; 17 passed and 0 failed.
- 2026-06-05 22:01:25 +08:00 - Prepared the `Sal` branch for release, cleared generated context, and adopted the newer `main` prompt.

## Steps and Instructions for Testing

- Detailed test procedures and expected results: [`LOG.md`](LOG.md#steps-and-instructions-for-testing)
- Executed test results: [`TEST_LOG.md`](TEST_LOG.md)
- Priority 1 backend structure tests are documented under:
  - Content-aware document chunking
  - Incremental document indexing
  - Scanned PDF OCR indexing
