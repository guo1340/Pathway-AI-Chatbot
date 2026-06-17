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
- [ ] Blocked: obtain an organization-approved Ubuntu Pro subscription, then attach the production server and apply the five reported ESM Apps security updates (`node-lodash`, `node-lodash-packages`, `python3-pip`, `python3-pip-whl`, and `python3-wheel`) after a package simulation and rollback snapshot. The server was confirmed unattached on 2026-06-13; no ESM packages were changed.
- [x] Review, update, and lock the webapp npm toolchain; local npm audits now report zero vulnerabilities.
- [x] Re-audit the webapp toolchain and determine whether a Vite 8 migration is still required. The current 2026-06-13 audit reports zero vulnerabilities on Vite 6.4.3, so no security-driven major upgrade is needed now.
- [x] Enforce a configurable estimated input-token ceiling before retrieval or LLM execution.
- [x] Cap model response generation for both OpenAI and Ollama providers.
- [x] Add process-local per-user daily token accounting and return `remaining_tokens` after each successful `/api/ask` response.
- [x] Move per-user daily token accounting to durable SQLite storage so balances survive restarts and remain atomic across multiple workers on one server.
- [x] Replace full JWT citation query parameters with short-lived filename-scoped file tickets while keeping source titles and filenames visible.
- [x] Decide whether to coordinate a Git history rewrite for the former EC2 IP/hostname. Making the repository private limits future access but does not erase existing clones, forks, or cached history. Because the address is public metadata rather than a credential and the current tracked tree is clean, rewriting history is optional unless an actual secret is found.

## Priority 3: Frontend Security

- [x] Restore login-based access control for `chat.pathway.training`. First confirm with the other developer that WordPress token injection works for subscriber accounts so legitimate users are not locked out.
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
- [x] Restore SSH-backed EC2 document listing, upload, and deletion behind an explicit Local/EC2 document-target toggle.
- [x] Add dashboard-managed backend/frontend stop controls, separate service output consoles, and filename search for Local and EC2 documents.
- [x] Re-enable live environment controls after the updated backend and indexing workflow are approved for deployment.
- [x] Replace SSH-based document management, prompt synchronization, and backend restart operations with authenticated HTTPS backend APIs so dashboard access does not depend on the operator's IP address. (No longer needed)
- [x] Add an option to restart pm2 on ec2 with a button. (No longer needed)
- [x] Add dashboard authentication before allowing access beyond the current local machine. The dashboard can upload and delete documents, edit prompts, and run git commands.(No longer needed)

## Priority 7: UI

- [x] Optimize the chatbot UI across desktop and mobile, including layout density, visual hierarchy, interaction feedback, accessibility, and consistency with the existing Pathway design.
- [x] Remove the page-level horizontal scrollbar that appeared at intermediate width/height thresholds while preserving responsive desktop and mobile layout.
- [x] Replace the nuke header control with an information dialog containing answer guidance, a 2x2 token-usage grid, and a red clear-history action whose confirmation dialog layers above the information dialog.
- [x] Show a proactive dialog before sending when the estimated request reservation would exceed the known remaining daily token balance.
- [x] Replace the full-screen response waiting overlay with a disabled Send button spinner so users can continue reading the chat while the answer is generated.
- [x] Render balanced backend `**text**` spans as bold text while preserving safe citation links.
- [x] Show a temporary Pathway bot response bubble with a loading spinner immediately after send, then replace it in place with the returned answer.

## Priority 8: Next-Stage Development.

- [x] Backend: design and implement durable conversation summarization after 12 sets of back-and-forth messages and when the user triggers conversation deletion. Before implementation, ask for details about the counting threshold, summary contents and retention, storage location, privacy expectations, and whether deletion should archive a final summary or permanently remove all conversation data.
- [x] Frontend: design and implement conversation deletion and summary-related behavior, including the backend request and user-facing confirmation/status states. Before implementation, ask for details about where the control belongs, confirmation wording, whether users can view or restore summaries, and the expected behavior after deletion.
- [x] Frontend: send logged in but not authorized users back to the login screen with an explanatory message.
- [x] Frontend: show a pop-up notification explaining why a message failed and redirect when authorization requires it.
- [x] Backend: adjust the logic for when user click the nuke button to clear history. This should not reset the token usage, and it should call for a summarization for the messages not summarized and delete current chats. It should never delete summary.
- [x] Frontend: require confirmation before the nuke button clears browser chat history. The dialog supports Cancel, close, backdrop click, Escape, and explicit confirmation.
- [x] Frontend: show a loading overlay while checking authentication and a separate loading overlay while waiting for the backend response.
- [x] Frontend: Make sure the daily token usage is showing in the info pop up dialog, right now it is not.
- [x] Frontend: when user is logged in from wordpress, this page is sending user to pathway.training/ask-ai which is using chat.pathway.training as an iframe. so it may cause the page to have a slight different layout shown on image. adjust the UI to make sure that the page can adjust to the page height and not have a set height.
- [x] Dashboard: add a functionality to check the current git branch that is running on ec2 so that when changes are made on prompt.txt, it could reflect on the actual testing and be up to date. Have the button to sync to current branch and option to write commit and push those changes to the correct active branch.
- [x] Frontend: Make the info button on the top right corner of the page much bigger, right now it is not visible enough.
- [x] Frontend: add a circled question mark button after the input tokens and max response header that opens a chat bubble like display that explains in common language what they each are, users may not know what they are.
- [x] Backend and Frontend: right now the daily balance has "waiting for the next backend balance" when page is refreshed, find a way to track the remaining daily balance when loading the messages, either keep track of it with the user id or with the latest message. Choose the cleanest and easiest way to do it so that it will always display the correct daily balance limit.
- [ ] needs to allow more than 2000 token per question since history may be too long, also add recomendations
- [x] WordPress/Auth: explicitly allow Contributor-role accounts to access Ask AI with a direct role check while keeping backend JWT validation on `edit_posts`.

## In Progress

- Current task: Simplified the Ask AI WordPress access check to the actual current requirement: users with role `contributor` can enter, and higher standard roles still pass through `edit_posts`. Backend JWT validation remains `edit_posts`.

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
- [x] Diagnosed the live Ask AI HTTP 401 boundary, clarified token-rejection messaging, and linked the login action directly to the top-level WordPress login page.
- [x] Added one durable per-user conversation thread with a private cumulative summary and at most 12 visible raw exchanges.
- [x] Added authenticated self-history loading and backend clear compaction without exposing summaries in the frontend.
- [x] Counted automatic and clear-triggered summarization against daily token usage and added transparent clear-dialog wording.
- [x] Audited the durable summary/history changes, serialized same-user ask/clear operations, and passed 16 backend, 3 summary frontend, 10 Priority 8, and 20 frontend security checks.
- [x] Confirmed chat queries have backend character/token limits, added the matching frontend character cap, and replaced reusable JWT citation links with scoped file tickets.
- [x] Recovered EC2 root capacity to approximately 1.3 GB free, restored the backend after reboot, and enabled the saved PM2 process through `pm2-ubuntu` systemd startup.
- [x] Preserved citations when model answers omit inline markers and added a linked frontend Sources list as a reliable fallback.
- [x] Re-audited the webapp after the earlier Vite advisory report; the current installed Vite 6.4.3 tree reports zero vulnerabilities, so the forced Vite 8 migration is no longer required.
- [x] Enlarged the Ask AI info button, added a plain-language token-usage help popover, and made the daily token balance load from `/api/history` so it no longer shows "Waiting for the next backend balance" after a refresh.
- [x] Fixed the duplicated WordPress admin bar that appeared after a timed-out session re-authenticated, by redirecting the top-level window instead of the embedded chat iframe.
- [x] Corrected the token help placement so the circled question marks are in the token grid header cells beside Input tokens and Max response, cleaned up the enlarged info button styling, and added a session fallback for the daily balance while `/api/history` remains the backend authority.
- [x] Fixed token help bubble clipping by allowing the token grid to overflow visibly and anchoring each bubble inside the dialog; added authenticated `/api/balance` as a direct fallback when history does not include `remaining_tokens`.
- [x] Reverted the overcomplicated Ask AI capability variable and replaced it with a direct Contributor role check plus the existing `edit_posts` fallback for higher roles.

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
- 2026-06-08 12:53:48 +08:00 - Diagnosed the production 401 as token validation rather than role denial, fixed the iframe login action, and passed all 10 focused frontend checks.
- 2026-06-10 22:54:49 +08:00 - Implemented durable per-user history, private cumulative summaries, automatic 12-exchange compaction, and summary-preserving clear behavior; generated tests remain pending.
- 2026-06-10 23:49:02 +08:00 - Ran and fixed the durable summary/history tests; all focused and regression suites passed.
- 2026-06-12 17:45:11 +08:00 - Audited the summary/history release, fixed same-user request concurrency, and reran the complete local regression matrix.
- 2026-06-12 18:10:23 +08:00 - Audited infrastructure exposure, confirmed query limits, and hardened citation file access without hiding source names.
- 2026-06-13 16:43:42 +08:00 - Recovered EC2 disk headroom, restored the saved backend process, and verified persistent PM2 startup plus local/public health.
- 2026-06-13 16:43:42 +08:00 - Fixed missing frontend reference markers/links by preserving backend citations and rendering a linked Sources list.
- 2026-06-13 17:30:57 +08:00 - Ran the complete local release matrix; fixed the localhost browser-test navigation dependency and passed 16 backend, 6 dashboard, 3 summary, 10 Priority 8, and 21 frontend checks.
- 2026-06-13 18:39:34 +08:00 - Completed the Priority 7 responsive layout, information dialog, nested clear confirmation, and proactive daily-token warning; generated UI browser checks remain pending.
- 2026-06-13 19:11:14 +08:00 - Replaced the response overlay with an inline Send spinner and passed 4 UI, 10 Priority 8, 3 summary, and 21 frontend security checks.
- 2026-06-13 20:09:23 +08:00 - Added safe bold answer rendering and an in-place loading response bubble; passed 5 UI, 10 Priority 8, 3 summary, and 21 frontend security checks.
- 2026-06-13 21:51:18 +08:00 - Audited all unchecked non-dashboard tasks; closed the stale Vite 8 security migration after a zero-vulnerability re-audit and retained the three external/operational tasks.
- 2026-06-13 22:00:10 +08:00 - Recorded owner confirmation that live WordPress subscriber/token verification is complete and clarified the optional Git-history rewrite plus manual Ubuntu ESM maintenance boundary.
- 2026-06-13 22:06:49 +08:00 - Reviewed the production Ubuntu transcript; identified five ESM Apps updates and confirmed installation is blocked until the server is attached to Ubuntu Pro.
- 2026-06-13 - Confirmed the production server remains unattached to Ubuntu Pro and deferred ESM installation pending an organization-approved subscription.
- 2026-06-15 17:16:36 +08:00 - Restored SSH-backed EC2 document management with a Local/EC2 dashboard toggle; live EC2 mutation tests remain pending configured SSH access.
- 2026-06-15 18:32:48 +08:00 - Added local service stop controls, frontend CLI output, and Local/EC2 document filename search; process lifecycle tests passed.
- 2026-06-15 18:36:17 +08:00 - Completed local dashboard SSH setup by creating the ignored environment file, restricting PEM permissions, and verifying EC2 document listing.
- 2026-06-16 16:41:39 +08:00 - Completed the new Priority 8 frontend and dashboard tasks: daily token balance in the info dialog, iframe-height-safe Ask AI layout, and EC2 active-branch prompt sync with optional commit/push.
- 2026-06-16 17:12:41 +08:00 - Fixed the hosted Ask AI double-scroll regression, made loaded history land at the newest message, and kept the logo/info topbar pinned while the chat log scrolls.
- 2026-06-16 17:36:18 +08:00 - Removed hard-coded WordPress admin-bar iframe offsets and switched Ask AI to measured available viewport height; focused and full frontend checks passed.
- 2026-06-16 18:15:23 +08:00 - Fixed outline/citation formatting by normalizing misplaced citation markers before headings or bold labels, restoring inline outline breaks, and adding prompt guidance plus browser regression coverage.
- 2026-06-16 19:56:52 +08:00 - Completed the three new Priority 8 items (larger info button, token-usage help popover, daily-balance-on-load) and fixed the duplicated WordPress admin bar after re-auth by redirecting the top window; added backend and browser tests.
- 2026-06-16 22:03:50 +08:00 - Redid the three Priority 8 token UI/balance fixes: moved help controls into the token grid headers, refined the larger info button style, persisted the latest known daily balance, and reran focused frontend/backend verification.
- 2026-06-16 23:26:50 +08:00 - Fixed the token help bubble z-index/clipping issue and added authenticated `/api/balance` so the frontend can still display daily balance when `/api/history` does not provide it.
- 2026-06-17 10:04:03 +08:00 - Clarified and guarded contributor-and-above Ask AI access with the shared `edit_posts` capability, plus instructions for future `read`/all-logged-in access.
- 2026-06-17 10:26:29 +08:00 - Simplified the Ask AI access fix by removing the extra capability variable and checking the WordPress `contributor` role directly, with `edit_posts` retained for higher roles and backend JWT validation.

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
