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

- [x] Complete the local operations dashboard for launching the backend and frontend, managing local bot documents, editing the local prompt, and monitoring local service status.
- [x] Make local document upload and deletion compatible with the backend's authenticated incremental upload/reload APIs.
- [x] Lock remote dashboard operations and explain the deployment-testing limitation in a dismissible dialog.
- [ ] Re-enable live environment controls after the updated backend and indexing workflow are approved for deployment.
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
- [x] Added separate local backend and frontend launch controls to the dashboard.
- [x] Added authenticated local document upload, listing, deletion, and index synchronization.
- [x] Locked remote dashboard actions until backend deployment testing is complete.
- [x] Fixed local text-document retrieval and local citation URLs found during the full dashboard regression run.
- [x] Hardened dashboard upload/delete failure handling and removed the Version Control section.
- [x] Validated the `Sal` backend against a copied production index and deployed it through PM2 on EC2.
- [x] Verified production incremental reload, scanned PDF OCR, JWT protection, chat retrieval, and public HTTPS health.
- [x] Downloaded and SHA-256 verified the EC2 release backup and raw test records locally.

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
- 2026-06-05 22:45:59 +08:00 - Completed local backend and frontend dashboard launch controls.
- 2026-06-05 22:45:59 +08:00 - Completed authenticated local document management from the dashboard.
- 2026-06-05 22:45:59 +08:00 - Locked remote dashboard operations with an explanatory dismissible dialog.
- 2026-06-05 23:29:17 +08:00 - Ran every LOG.md procedure; fixed local model, text retrieval, and citation issues; all reruns passed.
- 2026-06-06 00:21:45 +08:00 - Completed dashboard edge tests, fixed failures, and removed dashboard Git controls.
- 2026-06-06 16:56:46 +08:00 - Completed EC2 staging validation, production PM2 cutover, smoke tests, and disk-usage investigation.
- 2026-06-06 16:56:46 +08:00 - Stored and verified the production rollback backup and raw test transcript locally.

## Steps and Instructions for Testing

- Detailed test procedures and expected results: [`LOG.md`](LOG.md#steps-and-instructions-for-testing)
- Executed test results: [`TEST_LOG.md`](TEST_LOG.md)
- Priority 1 backend structure tests are documented under:
  - Content-aware document chunking
  - Incremental document indexing
  - Scanned PDF OCR indexing
  - Local dashboard service controls
  - Local dashboard document management
  - Remote dashboard operation lock
