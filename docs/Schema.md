# Database Schema

PostgreSQL schema for the HR Resume Review agent. Uses Drizzle ORM with Neon (serverless PostgreSQL).

---

## Auth Tables (Better Auth)

Generated via `pnpm dlx auth@latest generate --dialect postgresql --adapter drizzle`. These tables are managed by Better Auth and should not be manually edited.

### user

```sql
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### session

```sql
CREATE TABLE "session" (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session(user_id);
```

### account

```sql
CREATE TABLE "account" (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX account_userId_idx ON account(user_id);
```

### verification

```sql
CREATE TABLE "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
```

### organization (plugin)

```sql
CREATE TABLE "organization" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX organizations_slug_uidx ON organization(slug);
```

### member (plugin)

```sql
CREATE TABLE "member" (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX members_organizationId_idx ON member(organization_id);
CREATE INDEX members_userId_idx ON member(user_id);
```

### invitation (plugin)

```sql
CREATE TABLE "invitation" (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX invitations_organizationId_idx ON invitation(organization_id);
CREATE INDEX invitations_email_idx ON invitation(email);
```

### two_factor (plugin)

```sql
CREATE TABLE "two_factor" (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX twoFactors_userId_idx ON two_factor(user_id);
```

### passkey (plugin)

```sql
CREATE TABLE "passkey" (
  id TEXT PRIMARY KEY,
  name TEXT,
  public_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL,
  transports TEXT,
  aaguid TEXT,
  created_at TIMESTAMP
);
CREATE INDEX passkeys_userId_idx ON passkey(user_id);
CREATE INDEX passkeys_credentialID_idx ON passkey(credential_id);
```

### device_code (plugin)

```sql
CREATE TABLE "device_code" (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL,
  user_code TEXT NOT NULL,
  user_id TEXT,
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL,
  last_polled_at TIMESTAMP,
  polling_interval INTEGER,
  client_id TEXT,
  scope TEXT
);
```

---

## App Tables

### audit_logs

Required by auth.ts after-hook. Tracks authentication events. Schema aligned with `buildAuthAuditLog` output.

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  account_id TEXT,
  provider_id TEXT,
  target_user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
```

### job_postings

HR creates job postings with per-job weights for scoring.

```sql
CREATE TABLE job_postings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  organization_id TEXT REFERENCES "organization"(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  weights JSONB NOT NULL DEFAULT '{"skills": 35, "experience": 25, "projects": 15, "trust": 10, "education": 15}',
  criteria JSONB NOT NULL DEFAULT '{"rubricTemplate":"full_stack","requiredSkills":[],"bonusSkills":[],"experience":{"minYears":null,"targetLevel":"unknown","signals":[]},"projects":{"complexity":null,"expectations":[],"preferredEvidence":[]},"education":{"requirements":[],"preferred":[],"certifications":[]},"redFlags":[]}',
  location TEXT,
  employment_type TEXT DEFAULT 'full_time',
  deadline TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Fields:**
- `weights`: JSON object with keys `skills`, `experience`, `projects`, `trust`, `education`. Values are percentages that sum to 100.
- `criteria`: Structured HR rubric for the role, including required/bonus skills, experience signals, project expectations, education preferences, and red flags. Used by review agents, scoring prompts, evidence indexing, and Candidate Ask.
- `location`: Remote, on-site, hybrid, or specific location string.
- `employment_type`: full_time, part_time, contract, internship.
- `status`: active, paused, closed.

### resumes

Tracks uploaded resumes, raw extracted text, and applicant info extracted by agents.

```sql
CREATE TABLE resumes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_posting_id TEXT NOT NULL REFERENCES job_postings(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT NOT NULL REFERENCES "user"(id),
  applicant_name TEXT,
  applicant_email TEXT,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Fields:**
- `file_type`: pdf, docx, png, jpg, jpeg, tiff, bmp.
- `applicant_name`: Extracted by agents during Phase 2. Displayed on dashboard and used for outreach.
- `applicant_email`: Extracted by agents during Phase 2. Used for draft mail and interview scheduling.
- `raw_text`: Extracted text sent from client after parsing.
- `status`: uploaded, processing, completed, failed.

### resume_results

Agent analysis results for each resume.

```sql
CREATE TABLE resume_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resume_id TEXT NOT NULL REFERENCES resumes(id),
  agent_run_id TEXT,
  applicant_info JSONB,
  education JSONB,
  certifications JSONB,
  skills JSONB,
  experience JSONB,
  projects JSONB,
  github_data JSONB,
  platform_data JSONB,
  red_flags JSONB,
  skill_verification JSONB,
  project_matches JSONB,
  final_score INTEGER,
  rank INTEGER, -- legacy cache; application reads compute current rank
  summary TEXT,
  input_hashes JSONB,
  model_versions JSONB,
  rubric_snapshot JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

`resume_results.rank` is not authoritative. Candidate list/detail reads compute rank from the current job result set so parallel workflow completions cannot race while rewriting every result row.

`resume_results` is append-only across review attempts. A completed agent run writes `resume-result-{agentRunId}` once; repeating the same durable step is idempotent, while a deliberate retry creates a new agent run and result. Candidate reads use the newest successful result. `rubric_snapshot` preserves criteria and weights, while `input_hashes` records SHA-256 fingerprints without duplicating resume text. Legacy results whose original agent-run row was reused remain visible as non-openable legacy history entries instead of being incorrectly attached to a later attempt.

**JSONB shapes:**

```jsonc
// applicant_info
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1-555-0123",
  "linkedinUrl": "https://linkedin.com/in/johndoe",
  "githubUrl": "https://github.com/johndoe",
  "portfolioUrl": "https://johndoe.dev",
  "otherLinks": ["https://leetcode.com/johndoe"]
}

// education
{
  "education": [{
    "institution": "Massachusetts Institute of Technology",
    "degree": "Bachelor of Science",
    "field": "Computer Science",
    "gpa": "3.8",
    "startYear": 2016,
    "endYear": 2020,
    "country": "United States",
    "ranking": 1
  }]
}

// certifications
{
  "certifications": [{
    "name": "AWS Solutions Architect – Associate",
    "issuer": "Amazon Web Services",
    "dateObtained": "2023-06",
    "expiryDate": "2026-06",
    "credentialId": "AWS-SAA-123456",
    "tier": "cloud"
  }]
}
// tier: "professional" | "cloud" | "online" | "other"

// skills
{ "skills": [{ "name": "TypeScript", "level": "advanced" | null, "years": 5 }] }
// level: inferred from resume context. null if no signal found (verified in Phase 7).

// experience
{ "experience": [{ "company": "Acme", "role": "Senior Engineer", "duration": "2020-2024", "description": "..." }] }

// projects
{ "projects": [{ "name": "E-commerce Platform", "description": "...", "techStack": ["Next.js", "PostgreSQL"], "links": ["https://github.com/..."] }] }

// github_data
{
  "repos": 23,
  "totalStars": 456,
  "languages": {"TypeScript": 15, "Python": 8},
  "recentActivity": true,
  "contributionPattern": "consistent",
  "topRepos": [{
    "name": "my-project",
    "description": "A cool project",
    "stars": 120,
    "language": "TypeScript",
    "topics": ["react", "ai"]
  }]
}

// platform_data (LeetCode, HackerRank, HuggingFace)
{
  "leetcode": {
    "problemsSolved": 342,
    "ranking": 15000,
    "streak": 45,
    "topLanguages": ["Python", "C++", "Java"],
    "contestRating": 1650
  },
  "hackerrank": {
    "badges": ["Python", "Algorithm"],
    "rank": "5-star",
    "problemsSolved": 180,
    "languages": ["Python", "Java"]
  },
  "huggingface": {
    "models": 5,
    "datasets": 2,
    "spaces": 3,
    "topModels": [{"name": "fine-tuned-llama", "downloads": 1200, "likes": 45}],
    "contributions": ["transformers", "datasets"]
  }
}

// red_flags
{
  "flags": [{ "type": "employment_gap", "severity": "medium", "description": "6-month gap in 2022" }],
  "employmentGaps": [{ "start": "2022-01", "end": "2022-06", "duration": "6 months" }],
  "skillExaggerations": [{ "skill": "Rust", "resumeLevel": "advanced", "actualLevel": "beginner" }],
  "educationConcerns": [{ "type": "unverifiable", "description": "Degree from unaccredited institution" }],
  "overallTrust": 92
}
// flag types: employment_gap, skill_exaggeration, job_hopping, date_inconsistency,
//             education_mismatch, cert_fraud, link_broken, experience_inflation

// skill_verification
{
  "verifiedSkills": [{
    "name": "TypeScript",
    "category": "language",
    "claimedLevel": "advanced",        // null if not stated in resume
    "verifiedLevel": "advanced",       // always set — determined by evidence
    "confidence": 95,
    "evidence": ["15 repos in TypeScript", "Used in top 3 projects"],
    "verdict": "confirmed"
  }],
  "overallSkillTrust": 89
}
// verdict: "confirmed" | "partially_confirmed" | "unverified" | "disputed"
// verifiedLevel is evidence-based, may differ from claimedLevel
// If claimedLevel is null, verifiedLevel is inferred from GitHub/project evidence

// project_matches
{ "matchedProjects": [{ "project": "E-commerce Platform", "relevance": 87, "description": "Direct match for full-stack role" }] }

// model_versions
{
  "agentVersion": "resume-review-agent-v1",
  "assessmentSchemaVersion": "resume-assessment-v1",
  "model": "llama-3.3-70b-versatile",
  "specialistModels": ["llama-3.3-70b-versatile", "gpt-oss-120b"],
  "specialistProviders": ["groq", "cerebras"],
  "provider": "groq",
  "scoringVersion": "weighted-score-v1",
  "prompts": {
    "master": "resume-master-prompt-v2",
    "specialist": "resume-specialist-prompt-v2"
  }
}
```

### ai_provider_quota_reservations

Cross-instance model-provider quota ledger. Every physical Groq/Cerebras attempt first creates one idempotent reservation; completed usage and provider cooldowns are reconciled onto the same row.

```sql
CREATE TABLE ai_provider_quota_reservations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_kind TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  actual_input_tokens INTEGER,
  actual_output_tokens INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved',
  error_code TEXT,
  blocked_until TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSON
);
```

The scheduler evaluates rolling minute/hour/day usage while holding a transaction-scoped advisory lock on `provider:model`. Old rows remain operational audit data until the configured retention cleanup removes them.

### agent_runs

Tracks individual workflow executions with per-phase timing and token usage. Needed for debugging, streaming UI progress, and cost tracking.

```sql
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resume_id TEXT NOT NULL REFERENCES resumes(id),
  job_posting_id TEXT NOT NULL REFERENCES job_postings(id),
  status TEXT NOT NULL DEFAULT 'running',
  current_phase TEXT,
  phases JSONB NOT NULL DEFAULT '{}',
  model_versions JSONB,
  token_usage JSONB,
  started_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  error TEXT
);
```

**Fields:**
- `status`: running, completed, failed.
- `current_phase`: applicant_info, education, extraction, crawling, red_flags, skills_verification, project_match, scoring.
- `phases`: Per-phase timing and status (see JSONB shape below).
- `model_versions`: Which models were used per phase.
- `token_usage`: Input/output tokens and estimated cost.
- `error`: Error message if the run failed.

**`phases` JSONB shape:**
```json
{
  "applicant_info": { "status": "completed", "startedAt": "...", "completedAt": "...", "durationMs": 400 },
  "education": { "status": "completed", "durationMs": 600 },
  "extraction": { "status": "completed", "durationMs": 2800 },
  "crawling": { "status": "completed", "durationMs": 3200 },
  "red_flags": { "status": "completed", "durationMs": 900 },
  "skills_verification": { "status": "running" },
  "project_match": { "status": "pending" },
  "scoring": { "status": "pending" }
}
```

**`token_usage` JSONB shape:**
```json
{ "input": 12500, "output": 3200, "estimatedCost": 0 }
```

### candidate_notes

HR can add notes/comments to candidates during review.

```sql
CREATE TABLE candidate_notes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resume_id TEXT NOT NULL REFERENCES resumes(id),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### interviews

Track scheduled interviews for candidates.

```sql
CREATE TABLE interviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resume_id TEXT NOT NULL REFERENCES resumes(id),
  job_posting_id TEXT NOT NULL REFERENCES job_postings(id),
  scheduled_by TEXT NOT NULL REFERENCES "user"(id),
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  interview_type TEXT DEFAULT 'video',
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Fields:**
- `interview_type`: video, phone, onsite, technical.
- `meeting_url`: Zoom/Google Meet/Teams link for video interviews.
- `status`: scheduled, completed, cancelled, no_show.

### email_logs

Audit trail for sent emails (interview invites, candidate outreach).

```sql
CREATE TABLE email_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT REFERENCES "user"(id),
  resume_id TEXT REFERENCES resumes(id),
  job_posting_id TEXT REFERENCES job_postings(id),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Fields:**
- `job_posting_id`: Filter all emails sent for a specific job.
- `email_type`: interview_invite, candidate_outreach, rejection, custom.
- `status`: sent, delivered, failed, bounced.

---

## Relations

```sql
-- Auth relations (managed by Better Auth)
-- user 1:N session
-- user 1:N account
-- organization 1:N member
-- organization 1:N invitation
-- user 1:N two_factor
-- user 1:N passkey

-- App relations
-- user 1:N job_posting
-- organization 1:N job_posting
-- job_posting 1:N resume
-- resume 1:1 resume_result
-- resume 1:N agent_run
-- resume 1:N candidate_note
-- resume 1:N interview
-- resume 1:N email_log
-- job_posting 1:N agent_run
-- job_posting 1:N interview
-- job_posting 1:N email_log
-- user 1:N candidate_note
-- user 1:N interview
-- user 1:N audit_log
-- user 1:N email_log
```

---

## Migration Notes

1. **SQLite to PostgreSQL**: Done. `auth.schema.ts`, `columns.ts`, `audit-logs.schema.ts` all use `pgTable` from `drizzle-orm/pg-core`. Auth config uses `provider: "pg"`.

2. **Table naming**: Better Auth PostgreSQL uses singular table names (`user`, `session`, `account`) while SQLite uses plural (`users`, `sessions`, `accounts`). The `usePlural: true` option in `drizzleAdapter` handles this.

3. **ID types**: Auth tables use `text` IDs (UUIDs as strings). App tables use `text` with `gen_random_uuid()` defaults for consistency.

4. **Timestamps**: All tables use PostgreSQL `timestamp` type with `defaultNow()`.

5. **JSONB**: PostgreSQL native JSONB type used for all structured agent results, phases, token usage, and metadata.
