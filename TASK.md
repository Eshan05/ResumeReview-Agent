# TASK

## Current Goal

Build a robust resume-review backend pipeline with overlay-first candidate review:

- Upload resumes through UploadThing.
- Store file metadata and workflow state in Postgres.
- Extract text from PDFs, documents, images, and scanned PDFs.
- Run a structured Groq/Cerebras-backed review pipeline.
- Persist scored `resume_results`.
- Let HR define per-job criteria and scoring weights on the platform.
- Surface phase traces in the existing overlay-first UI.
- Answer HR questions through Candidate Ask using stored evidence, free Postgres search, and Groq synthesis.

## Implemented

- ACES-style per-file upload flow with worker preflight, retry, cancel, and per-file workflow state.
- UploadThing router accepts PDF, DOC, DOCX, TXT, MD, PNG, JPG/JPEG, and WebP.
- Files SDK UploadThing adapter is used for storage operations where it fits UploadThing semantics.
- Files SDK cleanup script deletes by UploadThing `customId`/resume id with bounded concurrency and keeps UploadThing file-key fallback.
- Resume extraction supports:
  - PDF text extraction with bounded page concurrency.
  - DOCX text extraction.
  - TXT/MD extraction.
  - Local Tesseract OCR for images.
  - Local scanned-PDF OCR by rendering pages with `pdfjs-dist` + `@napi-rs/canvas`, then OCRing rendered images.
- Upstash workflow route runs extraction and then candidate review.
- Groq and Cerebras review agents are wired through AI SDK `ToolLoopAgent` with structured output. Groq owns the master review; balanced specialist routing assigns structured extraction and red-flag detection to Cerebras with Groq failover.
- Provider requests now use a shared Postgres quota ledger with atomic provider/model reservations, idempotent Workflow replay keys, request/token windows, provider cooldown feedback, actual-usage reconciliation, and bounded retention cleanup. QStash flow control admits candidate workflows at one per minute by default while preserving parallel specialist phases inside each candidate.
- Quota exhaustion is a durable waiting state rather than a failed assessment: the UI reports `Waiting for model quota`, QStash resumes at the ledger retry time, specialists may fail over, and Candidate Ask preserves interactive headroom with cited extractive fallback.
- Review output is stored in `resume_results` and updates `resumes.status` to `scored`.
- Review results are append-only per agent run, with rubric snapshots, input hashes, and model/prompt/scoring versions. Candidate detail includes an all-attempt history list, can open stored agent-run traces, and labels detached pre-versioning results as legacy.
- Agent run phases preserve both `workflowRunId` and typed phase `items` for the pipeline overlay.
- Candidate Ask is implemented without paid embeddings/vector infra:
  - `candidate_evidence_chunks` stores resume text, job criteria, pipeline evidence, scoring rationale, project evidence, flags, and crawl results.
  - Chunk ids/content hashes are deterministic so re-review can replace/upsert evidence.
  - Retrieval uses Postgres full-text matching with lexical fallback and source-type boosts.
  - Groq answer synthesis runs in JSON mode and is locally validated/coerced before returning API responses.
  - Fallback returns extractive cited snippets with low/medium confidence if Groq is unavailable.
- Ask APIs are wired:
  - `POST /api/candidates/[candidateId]/ask`
  - `POST /api/jobs/[jobId]/ask`
  - `POST /api/candidates/[candidateId]/crawl`
- Candidate crawl workflow is added at `/api/workflows/candidate-crawl`.
- Candidate crawl runs are persisted in `candidate_crawl_runs` with status, reason, URLs, chunks indexed, errors, workflow run id, resume/job ids, and timestamps.
- Candidate crawl API supports:
  - `POST /api/candidates/[candidateId]/crawl`
  - `GET /api/candidates/[candidateId]/crawl?runId=...`
- Ask sheet polls crawl runs until terminal state and re-runs the original question after a completed crawl.
- Resume-review and candidate-crawl triggers are standardized for local QStash dev mode on `http://localhost:8080` with app callbacks on `http://localhost:3001`.
- Resume-review retries reuse cached extracted text when available, so retries are not blocked by a transient UploadThing/CDN fetch failure.
- Workflow failures are classified into extraction, OCR, model, validation, workflow, crawl, DB, timeout, and rate-limit categories.
- Completed workflow retries clear stale failure fields.
- Candidate ranks are computed from the current result set on read, ordered by final score with a deterministic id tie-break. Parallel workflow completions no longer rewrite every result row.
- Resume-review and Candidate Ask prompts serialize resume/JD/site/citation content into explicit untrusted JSON blocks and instruct models to ignore commands, role changes, score demands, and output-format requests found in evidence.
- Overlay-first Ask sheet is available from candidate row actions, candidate detail, and the job header.
- Ask grounding rejects unsupported generated claims and falls back to cited extractive snippets with explicit evidence gaps.
- GitHub public crawl enrichment uses the GitHub REST API for public profiles and repos, including repo descriptions, topics, languages, activity, and README snippets where available.
- Full platform crawling is now part of the review pipeline profile phase:
  - GitHub public API profile/repository enrichment.
  - LeetCode public GraphQL best-effort profile/contest/problem signal collection.
  - HackerRank public profile reachability/status collection without inventing private stats.
  - Hugging Face public API model/dataset/space collection by author.
  - LinkedIn validation only; no LinkedIn scraping.
  - Portfolio/project URL reachability and title extraction through a guarded Node.js fetcher with socket-bound DNS validation, redirect revalidation, and response bounds.
- Platform crawl reports are persisted into `resume_results.github_data` and `resume_results.platform_data`.
- Candidate Ask crawl uses the same platform crawler for supported public platform URLs before falling back to generic public-page extraction.
- Candidate Ask generic page extraction now uses the socket-bound public fetcher too; metadata and special-purpose targets cannot bypass crawl safety through the fallback path.
- The review pipeline now has deterministic sub-agent fleets for high-signal phases:
  - Phase 5 profile crawling runs platform-specific crawler/validator agents in parallel.
  - Phase 7 skills verification runs claim parsing, resume evidence, GitHub, project, coding-platform, and reconciliation sub-agents.
  - Phase 8 project matching runs project signal parsing, link verification, JD matching, and scorecard reconciliation sub-agents.
- Unit tests cover deterministic evidence chunk ids, crawl URL policy, citation filtering, crawl recommendation behavior, crawl ranking boosts, source boosts, confidence normalization, and unsupported generated claims.
- Local workflow integration script is available as `rtk pnpm test:workflows`; it can own or reuse local QStash and poll resume-review/candidate-crawl lifecycle status.
- Local OCR regression script is available as `rtk pnpm test:ocr`; it generates a scanned-style PDF fixture and validates Tesseract extraction.
- Batch API edge-case script is available as `rtk pnpm test:batch-edge`; it validates malformed JSON handling, 100-file batch boundaries, duplicate create idempotency, cancel scoping, dispatch validation, recovery behavior, unknown batch handling, and progress stream snapshots.
- DB schema has been pushed to the short-lived Neon DB, including `candidate_evidence_chunks` and its GIN search index.
- Job postings now store structured `criteria` JSON alongside weights.
- Criteria templates are available for full-stack, technical intern, and HackerRank-style screening.
- The candidate dashboard has an overlay-first Criteria sheet for required/bonus skills, project expectations, experience signals, education preferences, red flags, and scoring weights.
- Review prompts and specialist scoring now receive the structured criteria, and scoring includes the education component from per-job weights.
- Candidate detail score breakdown uses stored component scores and the job's weights instead of prototype fixed percentages.
- Saving criteria refreshes the job criteria evidence chunk used by Candidate Ask. Existing candidate result/pipeline evidence remains tied to the review run that produced it until the candidate is retried or re-reviewed.
- Resume uploads now have durable batch primitives for 100-file batches, with UploadThing still receiving 8 files per request and the client uploading chunks with concurrency 2.
- Batch progress and live resume status requests are windowed/chunked so the UI paths do not require one giant status request.
- Job-level scale target is up to roughly 10,000 uploads/candidates across many 100-file batches; candidate table pagination/search must stay server-side when that scale is reached.

## Important Decisions

- No raw model chain-of-thought is exposed. UI traces show phase status, agent names, summaries, evidence snippets, artifacts, timings, and final outputs.
- Free/local OCR is the default. Paid provider OCR stays optional.
- Model-backed structured output is the required scoring path; heuristic fallback is opt-in only via `RESUME_REVIEW_ALLOW_HEURISTIC_FALLBACK=true`. The default local provider policy is balanced Cerebras/Groq specialists with a Groq master.
- UploadThing handles its own transfer chunking, so Files SDK multipart/resumable sessions are not assumed for this adapter.
- Upload batch size is a per-batch cap, not a per-job cap. Large jobs should accumulate many durable batches and never depend on dispatching or polling the whole job at once.
- Backend work stays route-handler/workflow based. Server actions are reserved for form mutations.
- Criteria changes are explicit HR policy changes. They apply to future/retried reviews immediately; existing results are not silently re-scored.
- Candidate Ask never exposes raw model chain-of-thought. Answers expose citations, confidence, evidence gaps, follow-ups, and crawl recommendations only.
- Crawl is user-triggered only. It uses public HTTP(S) links already present in candidate evidence, depth 1 semantics, max 8 pages, and timeout/skip records.
- Platform crawling is public/free only. Login-gated or blocked platform pages are recorded as gaps/statuses, not treated as negative evidence.
- LinkedIn is treated as identity/profile URL validation only because scraping LinkedIn is brittle and not appropriate for this free local crawler.
- No Upstash Vector, paid embeddings, paid OCR, OpenAI, or Google dependency is used for Candidate Ask.
- Public portfolio fetching is Node-runtime only so the connection can use a custom DNS lookup. It blocks private/special-purpose IPv4 and IPv6 results at socket resolution time and applies the same policy locally and in Vercel Node.js Functions.

## Verification

- Versioned-assessment migration applied successfully to the configured Neon database.
- `rtk pnpm eval:offline` passed six synthetic cases covering ranking, formatting and demographic invariance, prompt injection, unsupported claims, and entry-level handling.
- `rtk pnpm eval:live:smoke` completed all 18 real model calls through the shared quota scheduler in 207.83s with no rate-limited reservation. The longer wall time is intentional rolling-window queueing under free-tier limits, not in-function retry sleep. It still failed 11 quality checks: strong/weak scores were 23/15, required skills were omitted, and the required ranking gap was not achieved. This is an active model/prompt/scoring quality issue; the offline fixture pass must not be treated as evidence that live ranking is good.
- Provider-quota migration applied to Neon. Concurrent database smoke under a one-request policy granted exactly one reservation and deferred the other; idempotency smoke returned the same reservation twice; a real Cerebras specialist completed through the ledger and reconciled 719 input/1,220 output tokens against its estimate.
- Local QStash integration smoke passed against `http://localhost:8080`; candidate workflow triggering and shared flow-control configuration work in development mode.
- Current assessment/evaluation pass: TypeScript lint, targeted Biome, the offline suite, and the production build passed; `rtk pnpm test:unit` passed 105 active tests with 1 OCR test skipped by default.
- Assessment history was verified against the configured Neon data, including separation of an old result from a later run that reused its legacy id. Cross-candidate/unknown historical pipeline ids return 404.
- Desktop and 390px mobile browser checks covered the history list, unavailable-trace states for legacy id collisions, loading layout, and a clean console. Historical pipeline routing is enabled for non-colliding agent runs.
- Public-URL tests cover direct private ranges, cloud metadata/link-local, CGNAT, benchmark/documentation ranges, IPv4-mapped IPv6, NAT64, 6to4, ULA, multicast, unsafe ports/credentials, and local hostnames.
- Public-URL behavior tests cover mixed public/private DNS answers, redirect revalidation, declared and streamed size limits, and timeouts.
- Live public-URL smoke fetched `https://example.com`; DNS-rebinding defense rejected `localtest.me` after it resolved to loopback.
- Candidate list/detail API smoke returned matching computed ranks after removing persisted rank rewrites.
- `rtk pnpm lint:ts`
- Targeted Biome checks for refactored UI/backend files.
- Upload dialog verified in Chrome for supported resume extensions.
- UploadThing test files and DB rows cleaned after upload tests.
- Local image OCR smoke passed.
- Local scanned-PDF OCR smoke passed.
- Groq agent smoke passed with structured output.
- Candidate evidence indexing smoke passed for `agent-run-local-resume-10f41649ba8bce34` with 33 chunks.
- Resume-review workflow retry completed end-to-end through local QStash on `http://localhost:8080`, callback `http://localhost:3001/api/workflows/resume-review`.
- Candidate crawl workflow completed end-to-end through local QStash for `https://github.com/Eshan05` and indexed GitHub profile/repository evidence chunks.
- Candidate Ask after crawl returned the crawl citation first and did not request another crawl.
- Pipeline dialog verified with the completed 9-phase trace and expandable evidence for project scorecards, score calculation, criteria alignment, support, and drag.
- Browser verification on `http://localhost:3001` covered render, upload dialog, row selection without navigation, bulk pipeline action with selection clear, row action Ask, job Ask, row click pipeline overlay, expanded pipeline evidence, and no console warnings/errors.
- Chrome extension verification on `http://localhost:3001` covered dashboard render, upload dialog accept list, row selection without navigation, bulk pipeline action with selection clear, settled 9-phase pipeline trace, and no console warnings/errors.
- Chrome extension verification on `http://localhost:3001` covered the Criteria sheet, Full Stack Intern rubric readback, template switching, clean save/close behavior, and a clean reload with no fresh console warnings/errors.
- `POST /api/jobs/local-resume-review-job/ask` ranks the refreshed job criteria chunk first for criteria/weight questions.
- `rtk pnpm db:push` requires an interactive confirmation in this terminal; `rtk pnpm exec drizzle-kit push --force` was used for the non-interactive schema push.
- Candidate Ask smoke passed for:
  - `Why did this candidate score 77?`
  - `Which projects support auth, RBAC, and API work?`
- Public-link Ask returns a gap instead of inventing profile evidence when no crawlable public URLs are stored.
- `rtk pnpm lint:ts` passed. Final rerun needed `NODE_OPTIONS=--max-old-space-size=4096` after parallel checks exhausted local heap.
- `rtk pnpm test:unit` passed after platform crawler additions with 17 active tests and 1 default-skipped OCR test.
- Targeted Biome checks passed for platform crawler, review-agent, workflow, service, local review script, and Candidate Ask crawl integration files.
- `rtk pnpm lint:ts` passed after platform crawler and sub-agent fleet wiring.
- Batch scale pass verification:
  - `rtk pnpm lint:ts` passed.
  - Targeted Biome checks passed for batch schema/service/API, upload dialog, and live candidate status files.
  - `rtk pnpm test:unit` passed with batch policy tests covering chunking, 10,000-upload job batching, retry/backoff, and aggregate states.
  - `rtk pnpm exec drizzle-kit push --force` was run through dotenv-loaded env and pushed `resume_upload_batches`, `resume_upload_items`, agent-run retry/workflow columns, indexes, and the `last_modified` bigint correction.
  - Local API smoke created a 100-item batch, read aggregate counts, canceled it, verified all 100 items were scoped to that canceled batch, and ran stale recovery with zero requeues.
  - Chrome on `http://localhost:3001` rendered the dashboard and opened the upload dialog; the Chrome extension timed out during file chooser automation, so the 100-file browser chooser path still needs a retry after reconnecting Chrome.
- Post-restart edge-case verification:
  - Restarted the app on `http://localhost:3001`.
  - Hardened batch create and dispatch APIs so malformed JSON returns `400 bad_request` instead of an unhandled server error.
  - `rtk pnpm lint:ts` passed.
  - `rtk pnpm test:unit` passed.
  - Targeted Biome checks passed for changed batch API/script/package files.
  - `rtk pnpm test:batch-edge` passed 12 edge cases, including the `lastModified` bigint roundtrip and cancel scoping across separate batches.
- Direct platform crawler smoke passed without Groq tokens:
  - GitHub, HackerRank, Hugging Face, and LinkedIn validation completed for extracted sample links.
  - LeetCode completed for a known public profile and correctly records a gap when the submitted username is not public/found.
  - Invalid/unreachable portfolio URLs are recorded as handled failures instead of blocking the review.
- Latest retry status:
  - QStash resume retry on the default `llama-3.3-70b-versatile` reached the workflow route but still failed at model quota with Groq reporting a 70B daily-token reset window.
  - Local real-resume review using `llama-3.1-8b-instant` completed without heuristic fallback and persisted a fresh 9-phase review for `local-resume-10f41649ba8bce34`.
  - Persisted result after the smaller-model smoke: final score 74, rank 1, 47 evidence chunks, GitHub crawl data for 33 public repositories, and completed platform/sub-agent pipeline evidence.
- `rtk pnpm test:ocr` passed with generated scanned-PDF OCR fixture.
- `rtk pnpm test:workflows` previously passed against local QStash on `http://localhost:8080` with `WORKFLOW_TEST_RESUME_ID` and `WORKFLOW_TEST_CANDIDATE_ID`; the latest criteria rerun reached extraction and specialist fit scoring with the new weights, then failed the final model step because Groq's free 70B daily token limit was exhausted.
- Targeted Biome checks passed for Candidate Ask, workflow, schema, and pipeline files.
- Targeted Biome checks passed for the criteria, evidence, Criteria sheet, and dashboard files.
- DB-level review smoke should be rerun after every agent pipeline change.

## Remaining

- Vercel runtime/cost/timeout validation for scanned PDFs is intentionally deferred for this pass.
- Production hardening still needs normal deployment concerns later: durable observability, rate-limit policy, and larger fixture coverage across many real resumes/JDs.
- Server-side candidate table pagination/search is still needed before treating the dashboard itself as comfortable at 10,000 candidates.
- Browser verification should be retried for the 100-file chooser/upload chunk progress after the Chrome extension connection recovers.

## Local Environment

- App server: `http://localhost:3001`
- Local QStash: `http://localhost:8080`
- Workflow callback: `http://localhost:3001/api/workflows/resume-review`
- Crawl workflow callback: `http://localhost:3001/api/workflows/candidate-crawl`
- Required local secret for real scoring: `GROQ_API_KEY` in `.env.local`
- Keep production service credentials out of commits.
