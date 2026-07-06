# Pipeline Implementation Notes

This file records implementation rules that should survive individual task notes and chat context.

## Canonical Skills Policy

- `resume_results.skills` is the canonical skill object used by the table, detail overlays, scoring evidence, and Candidate Ask.
- `skills.all` must come from deterministic resume evidence, not the final master model response.
- Source priority:
  1. Explicit resume skill sections and category rows such as `Languages`, `Technologies/Frameworks`, `Developer Tools / Platforms`, `Databases`, `Cloud`, and `Testing`.
  2. Explicit project tech-stack lines.
  3. Model output only for explanation text, never as the canonical skill inventory.
- Normalize common aliases before storing: `JS -> JavaScript`, `TS -> TypeScript`, `Postgres -> PostgreSQL`, `NextJS -> Next.js`, `React.js -> React`, `Node -> Node.js`.
- Broad concepts such as `Workflow` and `API design` may support score rationale only when evidence exists, but they must not replace concrete skill chips unless explicitly stated in the resume skill inventory.

## Agent Authority Boundaries

- Criteria decides which skills and signals matter for the job.
- The deterministic skill builder owns canonical `skills.all`, `skills.matched`, `skills.missing`, `skills.score`, and `skills.verification`.
- The phase 7 fleet verifies support, drag, and confidence using resume snippets, projects, GitHub/public platform data, and criteria.
- The master agent audits and explains. It must not collapse or overwrite canonical skills, project scorecards, profile crawl evidence, or criteria alignment.
- No raw model chain-of-thought is exposed. UI traces show phase status, agent names, summaries, evidence snippets, artifacts, timings, and final outputs.
- Resume text, job text, public-site content, prior agent artifacts, and Candidate Ask citations are serialized into explicit `UNTRUSTED_*_JSON` blocks. Model instructions require treating values in those blocks as evidence only and ignoring embedded commands, role changes, score demands, and output-format requests.

## Ranking And Public URL Safety

- Candidate rank is computed from the current result set when candidates are read, ordered by final score with candidate id as the deterministic tie-break. Workflow completion must not rewrite every stored result rank because concurrent workflows can interleave and corrupt persisted ordering.
- Portfolio URLs are fetched only in the Node.js runtime. The outbound socket uses a custom DNS lookup that rejects any private or special-purpose IPv4/IPv6 result before connection, so validation and connection cannot be separated by DNS rebinding.
- Public URL fetches reject credentials and nonstandard ports, revalidate every redirect, and enforce redirect, timeout, and response-size limits. This policy is compatible with local Node.js and Vercel's Node.js Function runtime; it is not an Edge-runtime helper.
- Candidate Ask generic page crawling uses the same guarded fetcher; syntactic URL checks are never treated as sufficient SSRF protection.

## Assessment History And Evaluation

- Successful review results are immutable per agent run. Candidate score, rank, detail, and Ask evidence use the newest successful assessment, while the history API includes completed, failed, running, skipped, and interrupted attempts.
- Agent attempts created without an explicit retry number allocate the next attempt, preventing local/manual reviews from overwriting an older run. Legacy result/run timestamp collisions are separated in history.
- Each assessment stores its exact criteria/weight snapshot, model/prompt/scoring version manifest, and hashes of the resume, JD, crawl report, and specialist artifacts. Raw resume text is not duplicated per result.
- `eval:offline` is the required deterministic regression suite. It grades committed, hand-authored observations and makes no model, crawl, or network calls. It proves the evaluator, constraints, and report plumbing behave deterministically; it does not prove that live model rankings are accurate.
- `eval:live:smoke` runs three complete pipelines once; `eval:live` runs the six-case suite three times and reports score distributions, variance, ranking, invariance, evidence, calls, tokens, duration, and the active provider/model/prompt/scoring versions. Live failures are release signals, not fixture values to relax until they pass.
- Committed fixtures are synthetic. Private real-resume fixtures and generated reports remain gitignored.

## Model Provider Routing

- Groq remains the master review and Candidate Ask provider.
- Resume specialist phases support `RESUME_SPECIALIST_PROVIDER=groq`, `cerebras`, or `balanced`. Balanced mode routes structured extraction and red-flag detection to Cerebras `gpt-oss-120b`; the remaining model specialists use Groq. The agent topology and async phase execution are unchanged.
- `RESUME_SPECIALIST_FALLBACK_PROVIDER=groq` makes Cerebras failures fail over to Groq before the opt-in heuristic fallback is considered. Cerebras provider retries default to one attempt so a free-tier 429 does not hold a serverless function open while another provider is available.
- This split is deliberate for the Cerebras free tier: its current public limit for `gpt-oss-120b` is 5 RPM and 30K TPM. Sending every specialist phase there consumes a candidate's entire request allowance and makes batch throughput worse. See the [Cerebras model catalog](https://inference-docs.cerebras.ai/models/overview) and [rate-limit documentation](https://inference-docs.cerebras.ai/support/rate-limits).
- `.env.local` configures local development only. The same non-secret routing variables and provider keys must be configured in each Vercel environment; they are never bundled into the client.

## Shared Provider Quota Scheduling

- QStash flow control is the outer admission queue. Free-tier defaults admit one resume-review workflow per 60 seconds with at most two active workflows. Specialist phases inside an admitted candidate remain parallel.
- `ai_provider_quota_reservations` is the cross-instance request/token ledger used by local workers, CLI runs, Candidate Ask, and Vercel Functions. Reservations are atomic under a Postgres advisory transaction lock scoped to provider and model. Keys combine the agent run, Workflow step, physical execution nonce, provider, model, mode, and retry attempt: a database retry is idempotent, while a failed Workflow step that physically calls a provider again receives a new reservation. Completed Workflow steps remain replay-safe through QStash's own step cache.
- Each physical provider attempt reserves estimated input plus an explicit completion-token ceiling. The policy enforces RPM, TPM, hourly tokens, RPD, and TPD with configurable headroom. Batch review uses 80% of published capacity; Candidate Ask may use the reserved remainder and falls back to cited extractive answers when capacity is unavailable.
- AI SDK transport retries are disabled on quota-managed calls. Schema-mode retries and provider failover happen outside the transport with a distinct reservation for every physical request, avoiding invisible quota consumption.
- Specialists try their configured secondary provider when the primary ledger is full. A master-review denial is represented as `quota-wait` and converted to `WorkflowRetryAfterError`, allowing QStash to durably resume it without holding a Node.js/Vercel function open or marking the assessment failed.
- A provider 429 records a shared cooldown before the error becomes a durable deferral. Later instances see that cooldown instead of independently retrying the same exhausted provider.
- Reservation outcomes retain estimates, actual input/output usage, status, and cooldown details. Run `pnpm quota:cleanup` periodically to remove records older than `PROVIDER_QUOTA_RETENTION_DAYS` (30 days by default, never less than two days).
- Default policies mirror the current free tiers: Cerebras `gpt-oss-120b` is 5 RPM/30K TPM/1M TPH/1M TPD; Groq `llama-3.3-70b-versatile` is 30 RPM/12K TPM/1K RPD/100K TPD. Limits are organization-specific, so production must set the `CEREBRAS_QUOTA_*` and `GROQ_QUOTA_*` variables from each account's console rather than assuming defaults forever.
- Required deployment state is the database migration plus `PROVIDER_QUOTA_SCHEDULER_ENABLED=true`. QStash local development and hosted QStash use the same flow-control configuration; only their endpoint/credentials differ. `.env.example` documents the complete local/Vercel policy surface without secrets.
- CLI evaluations and local one-off reviews may set `PROVIDER_QUOTA_WAIT_MAX_MS` to wait for short rolling-window capacity. Workflow/Vercel leaves it unset and uses durable retries instead, so serverless compute is never intentionally held during quota waits.

## Current Implementation Deltas From Older Docs

- No Gemini/Google/OpenAI path is part of the current default implementation. Groq and Cerebras are the model-backed review providers, with deterministic balanced specialist routing by default in local development.
- Free/local OCR is implemented on the server with PDF text extraction, DOCX extraction, local Tesseract image OCR, and scanned-PDF rendering/OCR.
- Uploads use UploadThing with Files SDK where it fits UploadThing storage semantics.
- Resume upload scale policy is 100 files per durable upload batch. A job can grow to roughly 10,000 uploads/candidates through multiple batches, so backend progress/status paths must stay batch/window scoped and must not assume the full job candidate set is loaded into one request.
- Workflow execution uses route handlers and Upstash Workflow/QStash. Local development uses `QSTASH_DEV=true`, local QStash at `http://localhost:8080`, and app callbacks on `http://localhost:3001`.
- Candidate Ask uses Neon/Postgres evidence chunks and lexical/full-text search. There is no paid embedding provider, Upstash Vector, or external search API.
- Platform crawling is public/free only:
  - GitHub REST API for profiles/repositories.
  - LeetCode public GraphQL best effort.
  - HackerRank public profile reachability/status only.
  - Hugging Face public API by author.
  - LinkedIn URL validation only; no LinkedIn scraping.
  - Portfolio/project URL reachability and title extraction through the guarded public-URL fetcher.

## Backlog To Keep Visible

- Full server-side candidate table pagination/search for jobs that approach 10,000 candidates.
- Continued batch concurrency and durability hardening beyond the initial 100-file batch dispatcher.
- Richer project-link crawling and public project evidence mapping.
- Email drafting, interview scheduling, and React Email/PDF output.
- Google Drive import and job-description extraction from links.
- Vercel runtime/cost/timeout validation, especially for scanned PDFs and OCR.
- Broader real-resume/JD fixture coverage across roles and file formats.
