# TASKS.md

## Current Upgrade Goal

Improve the chatbot's backend architecture and security before expanding frontend, dashboard, or visual features.

## Priority 1: Backend Structure Redo

- [x] Replace fixed-size document chunking with content-aware chunking that keeps chunks within configurable minimum and maximum sizes.
- [x] Implement incremental document indexing so uploads embed only new or changed documents instead of rebuilding the entire Chroma index. Review whether the current vector-store metadata and document identifiers must change to support safe updates and deletions.

## Priority 2: Backend Security

- [x] Remove `/api/chat` and keep `/api/ask` as the only authenticated chatbot endpoint.
- [x] Require a JWT with both the normal backend capability and the dashboard-only capability for `/api/upload` and `/api/reload`.
- [x] Add configurable, process-local rate limiting to authenticated `/api/ask` to limit automated abuse and uncontrolled OpenAI costs.
- [x] Reject oversized chat queries before retrieval or LLM processing.
- [x] Require authenticated header or citation-query JWT access for `/api/files/{name}`.
- [x] Load dashboard deployment details from local environment configuration instead of committing the public EC2 hostname.
- [ ] Apply the three pending Ubuntu ESM Apps security updates on the production server after checking compatibility and creating a rollback plan.
- [x] Review, update, and lock the webapp npm toolchain; local npm audits now report zero vulnerabilities.
- [x] Enforce a configurable estimated input-token ceiling before retrieval or LLM execution.
- [x] Cap model response generation for both OpenAI and Ollama providers.
- [x] Add process-local per-user daily token accounting and return `remaining_tokens` after each successful `/api/ask` response.
- [x] Move per-user daily token accounting to durable SQLite storage so balances survive restarts and remain atomic across multiple workers on one server.

## Priority 3: Frontend Security

- [ ] Restore login-based access control for `chat.pathway.training`. First confirm with the other developer that WordPress token injection works for subscriber accounts so legitimate users are not locked out.
- [x] Redirect tokenless, expired-token, and incompatible-role visitors from `chat.pathway.training` to the Pathway WordPress login/access page instead of showing a backend authorization error.

## Priority 4: Backend

- [x] Add bounded, user-isolated server-side conversation state that includes the prior active topic in later prompts, allowing vague follow-ups such as "give me its history" to resolve correctly.
- [x] Complete the production storage assessment and capacity plan for 500+ documents. Cleanup cannot provide enough long-term headroom; expand the root EBS volume to at least 20 GB or attach a dedicated expandable data volume for `docs`, `chroma_store`, and optionally the quota database before further document growth.

## Priority 5: Frontend

- [x] Always use authenticated `/api/ask`; remove the frontend fallback to `/api/chat`.
- [x] Estimate question plus recent-history input tokens before sending, display the estimate, and disable requests over the configured backend-aligned limit.
- [x] Display the backend-provided `remaining_tokens` balance after each successful answer and handle exhausted-balance errors.

## Priority 6: Dashboard

- [x] Complete the local operations dashboard for launching the backend and frontend, managing local bot documents, editing the local prompt, and monitoring local service status.
- [x] Make local document upload and deletion compatible with the backend's authenticated incremental upload/reload APIs.
- [x] Lock remote dashboard operations and explain the deployment-testing limitation in a dismissible dialog.
- [ ] Re-enable live environment controls after the updated backend and indexing workflow are approved for deployment.
- [ ] Replace SSH-based document management, prompt synchronization, and backend restart operations with authenticated HTTPS backend APIs so dashboard access does not depend on the operator's IP address.
- [ ] Add dashboard authentication before allowing access beyond the current local machine. The dashboard can upload and delete documents, edit prompts, and run git commands.

## Priority 7: UI

- [ ] Optimize the chatbot UI across desktop and mobile, including layout density, visual hierarchy, interaction feedback, accessibility, and consistency with the existing Pathway design.

## Priority 8: Next-Stage Development.

- [ ] Backend: design and implement durable conversation summarization after 12 back-and-forth messages and when the user triggers conversation deletion. Before implementation, ask for details about the counting threshold, summary contents and retention, storage location, privacy expectations, and whether deletion should archive a final summary or permanently remove all conversation data.
- [ ] Frontend: design and implement conversation deletion and summary-related behavior, including the backend request and user-facing confirmation/status states. Before implementation, ask for details about where the control belongs, confirmation wording, whether users can view or restore summaries, and the expected behavior after deletion.
- [x] Frontend: send logged in but not authorized users back to the login screen with an explanatory message.
- [x] Frontend: show a pop-up notification explaining why a message failed and redirect when authorization requires it.
- [ ] Backend: adjust the logic for when user click the nuke button to clear history. This should not reset the token usage, and it should call for a summarization for the messages not summarized and delete current chats.
- [x] Frontend: require confirmation before the nuke button clears browser chat history. The dialog supports Cancel, close, backdrop click, Escape, and explicit confirmation.
- [x] Frontend: show a loading overlay while checking authentication and a separate loading overlay while waiting for the backend response.

## In Progress

- Current task: Live WordPress role verification remains external. Conversation summarization and backend clear-history behavior remain untouched.

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
- [x] Added dedicated dashboard authorization for document upload and index reload.
- [x] Added configurable backend query limits and per-client chat rate limiting.
- [x] Protected backend document downloads while preserving authenticated citation URLs.
- [x] Moved dashboard deployment host configuration out of source control.
- [x] Ran and documented the complete local Priority 2 backend security verification suite.
- [x] Expanded the pre-EC2 release suite with CORS, citation-fragment, public citation, and dashboard remote-lock coverage.
- [x] Fixed file citation normalization so `#page=N` remains a URL fragment instead of becoming part of the filename.
- [x] Removed `/api/chat`, moved all frontend requests to authenticated `/api/ask`, and added frontend/backend per-request token ceilings.
- [x] Added per-user daily token reservations, accounting, and `remaining_tokens` to authenticated answer responses.
- [x] Persisted daily quota usage in SQLite with atomic cross-worker reservations and anonymized user keys.
- [x] Updated and locked the webapp toolchain to versions with zero reported npm vulnerabilities.
- [x] Added the hosted-chat access redirect for missing, expired, incompatible, and backend-rejected JWTs.
- [x] Added frontend daily token balance display and exhausted-balance handling.
- [x] Ran all 20 locally reproducible Priority 3 and 5 frontend behavior checks in headless Chrome, including authenticated localhost Send behavior.
- [x] Added explanatory authorization and request-failure dialogs with redirect handling.
- [x] Added destructive browser-history clear confirmation without resetting token usage.
- [x] Added separate authentication-checking and backend-response loading overlays.
- [x] Ran all 10 locally reproducible Priority 8 frontend interaction checks and corrected the missing-token explanation plus stable busy-button selector.

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
- 2026-06-06 22:59:03 +08:00 - Completed the local Priority 2 backend security code changes; production ESM updates remain pending.
- 2026-06-06 23:27:53 +08:00 - Ran all local Priority 2 security tests; 6 backend groups and 5 dashboard checks passed.
- 2026-06-07 10:50:38 +08:00 - Reran the final local security release gate; all executable checks passed and online-only Nginx, WordPress, CORS, PM2, and public HTTPS checks were documented.
- 2026-06-07 10:57:33 +08:00 - Ran all remaining pre-EC2 tests; fixed PDF citation fragment normalization; 7 backend groups and 6 dashboard checks passed.
- 2026-06-07 11:21:57 +08:00 - Required WordPress JWT authentication on `/api/chat`; all 8 backend security groups and the frontend build passed.
- 2026-06-07 12:25:42 +08:00 - Removed `/api/chat`, added frontend token estimation plus backend input/output token caps, and passed 9 backend groups and 6 dashboard checks.
- 2026-06-07 12:54:33 +08:00 - Added per-user daily token accounting and `remaining_tokens` responses; all 11 backend groups and 6 dashboard checks passed.
- 2026-06-07 13:12:05 +08:00 - Added durable SQLite quota storage, locked the webapp npm security updates, and passed 12 backend groups with zero npm advisories.
- 2026-06-07 13:28:47 +08:00 - Added bounded, user-isolated server conversation context and passed all 13 backend regression groups.
- 2026-06-07 13:28:47 +08:00 - Completed the backend storage assessment; documented root-volume expansion and a dedicated EBS data volume as the practical capacity options.
- 2026-06-07 13:42:14 +08:00 - Completed the final local pre-push release gate; fixed the Windows webapp build copy step and passed backend, dashboard, frontend, PHP, npm audit, syntax, and diff checks.
- 2026-06-07 16:58:09 +08:00 - Completed the repository-contained Priority 3 and 5 frontend work; subscriber-role compatibility remains pending external WordPress verification.
- 2026-06-07 17:17:23 +08:00 - Passed all 18 local frontend auth, quota, and responsive-layout checks; live subscriber-role verification remains pending.
- 2026-06-07 17:45:29 +08:00 - Fixed localhost Send by adding loopback-only Vite authentication; all 20 frontend checks passed.
- 2026-06-08 10:41:50 +08:00 - Completed the non-summary Priority 8 frontend states and generated their pending browser suite.
- 2026-06-08 11:22:31 +08:00 - Ran all 10 local Priority 8 interaction checks; fixed missing-token messaging and busy-button consistency; only live WordPress role verification remains.

## Steps and Instructions for Testing

- Detailed test procedures and expected results: [`LOG.md`](LOG.md#steps-and-instructions-for-testing)
- Executed test results: [`TEST_LOG.md`](TEST_LOG.md)
- Priority 2 security results and the pending production ESM maintenance checklist: [`TEST_LOG.md`](TEST_LOG.md#priority-2-backend-security-verification)
- Pending Priority 3 and 5 frontend behavior tests: [`TEST_LOG.md`](TEST_LOG.md#pending-priority-3-and-5-frontend-verification)
- Pending Priority 8 frontend interaction tests: [`TEST_LOG.md`](TEST_LOG.md#pending-priority-8-frontend-interaction-verification)
- Priority 1 backend structure tests are documented under:
  - Content-aware document chunking
  - Incremental document indexing
  - Scanned PDF OCR indexing
  - Local dashboard service controls
  - Local dashboard document management
  - Remote dashboard operation lock
