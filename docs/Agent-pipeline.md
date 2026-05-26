# Agent Pipeline Design

## Architecture Overview

```
CLIENT (Browser)                    SERVER (Vercel)
┌─────────────────┐                ┌─────────────────────┐
│ pdfjs-dist       │                │ Upstash Workflow     │
│ mammoth          │  plain text    │ SDK                  │
│ tesseract.js     │ ─────────────→ │                     │
│                  │                │ ┌─────────────────┐ │
│ (file parsing)   │                │ │ Agent Pipeline   │ │
└─────────────────┘                │ │ (9 phases)       │ │
                                   │ └─────────────────┘ │
                                   │                     │
                                   │ Providers:          │
                                   │ - Groq (extraction) │
                                   │ - Gemini (reasoning)│
                                   │ - Groq (scoring)    │
                                   └─────────────────────┘
```

### Why Client-Side File Parsing

- `@napi-rs/canvas` (required by `pdfjs-dist` on server) does not work on Vercel edge/serverless
- `pdfjs-dist`, `mammoth`, and `tesseract.js` all work in the browser
- Server only receives plain text — no native dependencies needed
- Eliminates cold start overhead from file parsing
- Edge-compatible server code

---

## Free Model Strategy

| Provider | Free Tier | Best For | Context |
|----------|-----------|----------|---------|
| **Groq** | 30 RPM, 6K TPM, 14,400 RPD | Fast extraction, structured output, scoring | 128K |
| **Gemini** | 10 RPM, 1,500 RPD | Reasoning, red-flag detection, verification | 1M |

### Model Assignment

| Agent | Provider | Model | Why |
|-------|----------|-------|-----|
| Applicant Info Extractor | Groq | Llama 4 Scout | Fast, structured output |
| Education Extractor | Groq | Llama 4 Scout | Fast, structured output |
| Certification Extractor | Groq | Llama 4 Scout | Fast, classification |
| Skills Extractor | Groq | Llama 4 Scout | Fast, 128K context |
| Experience Analyzer | Groq | Llama 4 Scout | Fast, structured output |
| Projects Extractor | Groq | Llama 4 Scout | Fast, structured output |
| GitHub Crawler | Groq | Llama 4 Scout | Fast, tool calling |
| LeetCode Crawler | Groq | Llama 4 Scout | Fast, tool calling |
| HackerRank Crawler | Groq | Llama 4 Scout | Fast, tool calling |
| HuggingFace Crawler | Groq | Llama 4 Scout | Fast, tool calling |
| Red Flag Detector | Gemini | 2.5 Flash | 1M context, strong reasoning |
| Skills Claim Parser | Groq | Llama 4 Scout | Fast extraction |
| GitHub Skill Verifier | Groq | Llama 4 Scout | Fast, repo analysis |
| Project Skill Verifier | Groq | Llama 4 Scout | Fast, link crawling |
| Skill Reconciler | Gemini | 2.5 Flash | 1M context, reasoning |
| Project Matcher | Gemini | 2.5 Flash | 1M context, reasoning |
| Scoring Agent | Groq | Llama 3.3 70B | 128K context, high quality |

---

## Batch Processing

HR uploads hundreds of resumes → processed in batches of 3-4.

```
HR uploads 100 resumes + Job Description
            │
            ▼
    Client parses each file → extracts text
            │
            ▼ sends batch of { resumeId, text } to server
    ┌───────────────────┐
    │  API Route         │
    │  Creates Workflow  │  Upstash Workflow SDK
    └───────┬───────────┘
            │
            ▼ Workflow processes 3-4 at a time (parallelism limit)
    ┌───────┴───────────────────────────────┐
    │  Per-Resume Pipeline:                 │
    │                                       │
    │  Phase 1: Receive text                │
    │  Phase 2: Applicant info extraction   │
    │  Phase 3: Education & certs           │
    │  Phase 4: Parallel extraction         │
    │    ├── Skills Agent (Groq)            │
    │    ├── Experience Agent (Groq)        │
    │    └── Projects Agent (Groq)          │
    │  Phase 5: Profile crawling            │
    │    ├── GitHub (REST API)              │
    │    ├── LeetCode                       │
    │    ├── HackerRank                     │
    │    ├── HuggingFace                    │
    │    └── LinkedIn URL check             │
    │  Phase 6: Red Flag (Gemini)           │
    │  Phase 7: Skills Verification         │
    │    ├── Skills Claim Parser (Groq)     │
    │    ├── GitHub Skill Verifier (Groq)   │
    │    ├── Project Skill Verifier (Groq)  │
    │    └── Skill Reconciler (Gemini)      │
    │  Phase 8: Project Match (Gemini)      │
    │  Phase 9: Score (Groq)                │
    │                                       │
    │  Progress streamed to client          │
    └───────────────────────────────────────┘
```

---

## Per-Resume Pipeline (9 Phases)

### Phase 1: Receive Extracted Text

Client sends pre-extracted text. No server-side file parsing.

```
Input: { resumeId, rawText, fileType }
Output: rawText stored in workflow state
```

### Phase 2: Applicant Info Extraction

Extract contact details and profile links from raw text. This populates the `resumes` table fields (`applicant_name`, `applicant_email`) and provides URLs needed by Phase 5 (profile crawling).

```
rawText
  │
  └──→ Applicant Info Extractor Agent (Groq: Llama 4 Scout)
       Input: rawText
       Output: {
         name: string,
         email: string,
         phone: string,
         linkedinUrl: string | null,
         githubUrl: string | null,
         portfolioUrl: string | null,
         otherLinks: string[]
       }
```

### Phase 3: Education & Certification Extraction

Extract education history and professional certifications. Certifications are tiered by industry value.

```
rawText
  │
  ├──→ Education Extractor Agent (Groq: Llama 4 Scout)
  │    Input: rawText
  │    Output: {
  │      education: [{
  │        institution: string,
  │        degree: string,
  │        field: string,
  │        gpa: string | null,
  │        startYear: number,
  │        endYear: number,
  │        country: string,
  │        ranking: number | null   // from static lookup table
  │      }]
  │    }
  │
  └──→ Certification Extractor Agent (Groq: Llama 4 Scout)
       Input: rawText
       Output: {
         certifications: [{
           name: string,
           issuer: string,
           dateObtained: string,
           expiryDate: string | null,
           credentialId: string | null,
           tier: "professional" | "cloud" | "online" | "other"
         }]
       }
```

**Certification Tier Definitions:**

| Tier | Description | Examples | Score Weight |
|------|-------------|----------|--------------|
| `professional` | Industry-recognized, exam-based | CPA, PMP, CISSP, CFA, Bar Admission | High |
| `cloud` | Vendor cloud certifications | AWS SAA, Azure Admin, GCP Pro | High |
| `online` | Course completion certificates | Udemy, Coursera, LinkedIn Learning | Low/None |
| `other` | Miscellaneous | Company-internal certs, workshop certs | Low |

### Phase 4: Structured Data Extraction (parallel sub-agents)

```
rawText
  │
  ├──→ Skills Extractor Agent (Groq: Llama 4 Scout)
  │    Input: rawText
  │    Output: { skills: [{ name, level, years }] }
  │
  │    Level inference strategy:
  │    - If candidate explicitly states level ("expert in TypeScript") → use stated level
  │    - If years are mentioned ("5 years of Python") → map to level:
  │        0-1y = beginner, 2-3y = intermediate, 4+ = advanced
  │    - If role seniority implies skill ("Senior React Developer") → infer advanced
  │    - If no signal → output level as null (Phase 7 will verify via evidence)
  │
  │    NOTE: Levels extracted here are CLAIMED levels. Phase 7 (Skills Verification)
  │    validates them against GitHub repos, project links, and experience context.
  │    A skill with no stated level will be assessed purely by evidence in Phase 7.
  │
  ├──→ Experience Analyzer Agent (Groq: Llama 4 Scout)
  │    Input: rawText
  │    Output: { experience: [{ company, role, duration, description }] }
  │
  └──→ Projects Extractor Agent (Groq: Llama 4 Scout)
       Input: rawText
       Output: { projects: [{ name, description, techStack, links }] }
```

### Phase 5: Profile Crawling (parallel)

Crawl external platforms to enrich candidate profile. Uses URLs extracted in Phase 2.

```
URLs from Phase 2
  │
  ├──→ GitHub Crawler Agent (Groq: Llama 4 Scout)
  │    Tools: GitHub REST API (free, 60 req/hr unauthenticated)
  │    Input: { githubUrl }
  │    Output: {
  │      repos: number,
  │      totalStars: number,
  │      languages: Record<string, number>,
  │      recentActivity: boolean,
  │      contributionPattern: string,
  │      topRepos: [{ name, description, stars, language, topics }]
  │    }
  │
  ├──→ LeetCode Crawler Agent (Groq: Llama 4 Scout)
  │    Input: { leetcodeUrl } or { candidateName }
  │    Output: {
  │      problemsSolved: number,
  │      ranking: number | null,
  │      streak: number,
  │      topLanguages: string[],
  │      contestRating: number | null
  │    }
  │
  ├──→ HackerRank Crawler Agent (Groq: Llama 4 Scout)
  │    Input: { hackerrankUrl } or { candidateName }
  │    Output: {
  │      badges: string[],
  │      rank: string | null,
  │      problemsSolved: number,
  │      languages: string[]
  │    }
  │
  ├──→ HuggingFace Crawler Agent (Groq: Llama 4 Scout)
  │    Input: { huggingfaceUrl } or { candidateName }
  │    Output: {
  │      models: number,
  │      datasets: number,
  │      spaces: number,
  │      topModels: [{ name, downloads, likes }],
  │      contributions: string[]
  │    }
  │
  └──→ LinkedIn URL Validator
       Input: { linkedinUrl }
       Output: { isValid: boolean }
       (Just checks if URL is valid, no scraping)
```

**Note on platform crawlers:** Most platforms don't have public APIs. These agents use web scraping via the LLM's tool calling or HTTP requests to public profile endpoints. Rate limits apply. If a platform is unavailable, the agent returns empty/null results and the pipeline continues.

### Phase 6: Red Flag Detection

```
Combined data from Phase 2 + 3 + 4 + 5
  │
  └──→ Red Flag Detector Agent (Gemini: 2.5 Flash)
       Input: { applicantInfo, education, certifications, skills, experience, projects, githubData, platformData }
       Output: {
         flags: [{ type, severity, description }],
         employmentGaps: [{ start, end, duration }],
         skillExaggerations: [{ skill, resumeLevel, actualLevel }],
         educationConcerns: [{ type, description }],
         overallTrust: number (0-100)
       }
```

**Red Flag Types:**
- `employment_gap` — Unexplained gap in work history
- `skill_exaggeration` — Claimed skill not supported by evidence
- `job_hopping` — Multiple short tenures (< 1 year)
- `date_inconsistency` — Overlapping employment dates
- `education_mismatch` — Claimed degree not verifiable
- `cert_fraud` — Suspicious or unverifiable certification
- `link_broken` — Portfolio/project links are dead
- `experience_inflation` — Role seniority doesn't match description

### Phase 7: Skills Verification (fleet of sub-agents)

Cross-reference claimed skills against evidence from GitHub repos, project links, and experience descriptions. Runs 4 sub-agents in parallel, then a reconciler.

**How skill levels are determined when not stated in the resume:**

The Skills Extractor (Phase 2) may output `level: null` if the resume doesn't mention proficiency. In Phase 7, the verification agents infer the actual level purely from evidence:

| Evidence Source | How It Determines Level |
|----------------|------------------------|
| **GitHub repos** | Number of repos using the skill, commit frequency, code complexity, star counts. 1 repo with few commits = beginner. 10+ repos with active commits = advanced. |
| **Project descriptions** | Tech mentioned in project context. "Built X with React" = at least intermediate. "Contributed to Y's React codebase" = moderate signal. |
| **Experience descriptions** | Keywords like "architected", "led migration of", "designed system using X" imply advanced. "Used X to build Y" implies intermediate. |
| **LeetCode / HackerRank** | Problem counts and contest ratings for algorithmic skills (Python, Java, C++). |
| **HuggingFace** | Models/datasets published for ML skills. |

The Skill Reconciler combines these signals into a final `verifiedLevel` and `confidence` score. A skill with no stated level but strong GitHub evidence (e.g., 15 TypeScript repos, 456 stars) can still be verified as "advanced".

```
Skills from Phase 4 + GitHub data from Phase 5 + Projects from Phase 4
  │
  ├──→ Skills Claim Parser (Groq: Llama 4 Scout)
  │    Input: { skills }
  │    Output: {
  │      parsedSkills: [{
  │        name: string,
  │        category: "language" | "framework" | "tool" | "concept",
  │        claimedLevel: string | null   // null if not stated in resume
  │      }]
  │    }
  │
  ├──→ GitHub Skill Verifier (Groq: Llama 4 Scout)
  │    Input: { parsedSkills, githubData, topRepos }
  │    Analysis:
  │    - Count repos where skill is primary language/framework
  │    - Check commit frequency and recency for that skill
  │    - Look at star counts on skill-related repos
  │    - Assess code complexity (file structure, README quality)
  │    Output: {
  │      verifications: [{
  │        skill: string,
  │        evidence: "strong" | "moderate" | "weak" | "none",
  │        sources: string[],          // e.g., ["repo:ecommerce-platform", "repo:ml-pipeline"]
  │        inferredLevel: string,      // "beginner" | "intermediate" | "advanced"
  │        confidence: number (0-100)
  │      }]
  │    }
  │
  ├──→ Project Skill Verifier (Groq: Llama 4 Scout)
  │    Input: { parsedSkills, projects }
  │    Tools: HTTP requests to project demo/live URLs
  │    Analysis:
  │    - Check if project links are live and use the claimed tech
  │    - Look at project descriptions for depth of usage
  │    - Cross-reference tech stack mentions
  │    Output: {
  │      verifications: [{
  │        skill: string,
  │        evidence: "strong" | "moderate" | "weak" | "none",
  │        sources: string[],
  │        inferredLevel: string,
  │        confidence: number (0-100)
  │      }]
  │    }
  │
  └──→ Skill Reconciler (Gemini: 2.5 Flash)
       Input: { parsedSkills, githubVerifications, projectVerifications }
       Analysis:
       - If claimedLevel is null → use evidence to determine level
       - If claimedLevel exists → compare against evidence
       - Resolve conflicts between GitHub and project signals
       - Weight: GitHub evidence > project evidence > resume claim
       Output: {
         verifiedSkills: [{
           name: string,
           category: string,
           claimedLevel: string | null,
           verifiedLevel: string,       // always set — determined by evidence
           confidence: number (0-100),
           evidence: string[],
           verdict: "confirmed" | "partially_confirmed" | "unverified" | "disputed"
         }],
         overallSkillTrust: number (0-100)
       }
```

**Why a fleet?** Each sub-agent specializes in one verification source (GitHub repos vs. live projects). The reconciler (Gemini) handles the reasoning-heavy task of combining conflicting signals into a final verdict.

### Phase 8: Project Matching

```
Projects from Phase 4 + Job Description
  │
  └──→ Project Matcher Agent (Gemini: 2.5 Flash)
       Input: { projects, jobDescription, requiredSkills }
       Output: {
         matchedProjects: [{
           project, relevance (0-100), explanation
         }]
       }
```

### Phase 9: Scoring

```
All sub-agent results + HR weights
  │
  └──→ Scoring Agent (Groq: Llama 3.3 70B)
       Input: {
         applicantInfo, education, certifications,
         skills, experience, projects,
         githubData, platformData, redFlags,
         skillVerification, projectMatches,
         hrWeights: { skills, experience, projects, trust, education }
       }
       Output: {
         finalScore: number (0-100),
         breakdown: { skills, experience, projects, trust, education },
         rank: number,
         summary: string
       }
```

**Scoring Weight Adjustments:**
- `education` weight: factors in university ranking and degree relevance
- `trust` weight: now informed by skills verification confidence (Phase 7) in addition to red flags (Phase 6)
- Certifications: tier 1/2 certs add to skills score, tier 3 ignored

---

## Streaming Progress UI

Each resume shows real-time step-by-step progress:

```
┌─ Resume: john_doe.pdf ─────────────────────────────────────┐
│                                                             │
│  ✓ Phase 1: Text received (0.1s)                            │
│  ├─ Format: PDF (text-native)                               │
│  └─ Characters: 4,521                                        │
│                                                             │
│  ✓ Phase 2: Applicant info (0.4s)              [▼ expand]   │
│  ├─ Name: John Doe                                          │
│  ├─ Email: john@example.com                                 │
│  └─ GitHub: github.com/johndoe                              │
│                                                             │
│  ✓ Phase 3: Education & certs (0.6s)           [▼ expand]   │
│  ├─ Education: 2 entries                                    │
│  │   └─ B.S. Computer Science — MIT (Rank #1)              │
│  └─ Certifications: 2 found                                 │
│      ├─ AWS Solutions Architect (Professional)              │
│      └─ Udemy React Course (Online)                         │
│                                                             │
│  ✓ Phase 4: Data extraction (2.8s)              [▼ expand]   │
│  ├─ Skills: 14 detected                                     │
│  ├─ Experience: 3 positions                                 │
│  └─ Projects: 5 found                                       │
│                                                             │
│  ✓ Phase 5: Profile crawling (3.2s)             [▼ expand]   │
│  ├─ GitHub: Valid (23 repos, 456 stars)                     │
│  ├─ LeetCode: Valid (342 solved, Rank 15K)                  │
│  ├─ HackerRank: Not found                                   │
│  ├─ HuggingFace: Valid (5 models, 1.2K downloads)           │
│  └─ LinkedIn: Valid URL                                     │
│                                                             │
│  ✓ Phase 6: Red flag check (0.9s)                [▼ expand]   │
│  ├─ Employment gaps: None                                    │
│  ├─ Skill consistency: Verified                              │
│  └─ Trust score: 92/100                                     │
│                                                             │
│  ✓ Phase 7: Skills verification (2.1s)           [▼ expand]   │
│  ├─ 12/14 skills confirmed                                  │
│  ├─ 2/14 partially confirmed                                │
│  ├─ 0/14 unverified                                         │
│  └─ Skill trust: 89/100                                     │
│                                                             │
│  ✓ Phase 8: Project matching (1.1s)              [▼ expand]   │
│  ├─ "E-commerce platform" → 87% match                       │
│  └─ "ML Pipeline" → 72% match                               │
│                                                             │
│  ✓ Phase 9: Final score (0.3s)                                │
│  └─ Score: 87/100 — Rank #2 of 12                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Implementation uses `createStreamableValue` from AI SDK to push progress updates per phase. Client subscribes and renders expandable accordion items.

---

## Rate Limit Budget (100 resumes)

| Agent | Provider | Per Resume | Total (100) | Free Limit | Status |
|-------|----------|-----------|-------------|------------|--------|
| Applicant Info | Groq | 1 | 100 | 14,400 RPD | OK |
| Education | Groq | 1 | 100 | 14,400 RPD | OK |
| Certification | Groq | 1 | 100 | 14,400 RPD | OK |
| Skills | Groq | 1 | 100 | 14,400 RPD | OK |
| Experience | Groq | 1 | 100 | 14,400 RPD | OK |
| Projects | Groq | 1 | 100 | 14,400 RPD | OK |
| GitHub | Groq | 1 | 100 | 14,400 RPD | OK |
| LeetCode | Groq | 1 | 100 | 14,400 RPD | OK |
| HackerRank | Groq | 1 | 100 | 14,400 RPD | OK |
| HuggingFace | Groq | 1 | 100 | 14,400 RPD | OK |
| Red Flag | Gemini | 1 | 100 | 1,500 RPD | OK |
| Skills Claim Parser | Groq | 1 | 100 | 14,400 RPD | OK |
| GitHub Skill Verifier | Groq | 1 | 100 | 14,400 RPD | OK |
| Project Skill Verifier | Groq | 1 | 100 | 14,400 RPD | OK |
| Skill Reconciler | Gemini | 1 | 100 | 1,500 RPD | OK |
| Project Match | Gemini | 1 | 100 | 1,500 RPD | OK |
| Scoring | Groq | 1 | 100 | 14,400 RPD | OK |

**Total**: ~1,100 API calls per 100 resumes. All within free tiers.

**Provider budget per 100 resumes:**
- **Groq**: 900 calls (of 14,400 daily limit) — 6.25% utilization
- **Gemini**: 300 calls (of 1,500 daily limit) — 20% utilization

---

## File Parsing (Client-Side)

```typescript
// PDF (text-native)
import * as pdfjsLib from 'pdfjs-dist';
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return text;
}

// DOCX
import mammoth from 'mammoth';
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// Image / scanned PDF page
import Tesseract from 'tesseract.js';
async function extractImageText(file: File): Promise<string> {
  const { data: { text } } = await Tesseract.recognize(file, 'eng');
  return text;
}

// Router: detect file type and extract
async function extractResumeText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return extractPdfText(file);
  if (ext === 'docx') return extractDocxText(file);
  if (['png', 'jpg', 'jpeg', 'tiff', 'bmp'].includes(ext || ''))
    return extractImageText(file);
  throw new Error(`Unsupported file type: ${ext}`);
}
```

---

## Database Schema

```sql
-- Job postings with per-job weights
CREATE TABLE job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  weights JSONB NOT NULL DEFAULT '{"skills": 35, "experience": 25, "projects": 15, "trust": 10, "education": 15}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Resumes
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  raw_text TEXT,
  applicant_name TEXT,
  applicant_email TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent results per resume
CREATE TABLE resume_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id),
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
  final_score INT,
  rank INT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing state (also cached in Upstash Redis)
CREATE TABLE resume_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resumes(id),
  current_phase TEXT NOT NULL,
  phase_results JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## Key Dependencies

```json
{
  "dependencies": {
    "ai": "^6.x",
    "@ai-sdk/openai": "^1.x",
    "@ai-sdk/google": "^1.x",
    "@upstash/qstash": "^2.x",
    "@upstash/redis": "^1.x",
    "pdfjs-dist": "^4.x",
    "mammoth": "^1.x",
    "tesseract.js": "^5.x"
  }
}
```

---

## Upstash Workflow Integration

Using Upstash Workflow SDK for durable, multi-step agent execution:

```typescript
import { Workflow } from '@upstash/workflow';

const resumeWorkflow = new Workflow({
  onStart: async ({ resumeId }) => {
    // Mark processing started
    await redis.hset(`resume:${resumeId}`, { status: 'processing' });
  },
  onProgress: async ({ resumeId, phase, result }) => {
    // Stream progress to client via SSE
    await redis.hset(`resume:${resumeId}`, {
      [`phase:${phase}`]: JSON.stringify(result)
    });
  },
  onComplete: async ({ resumeId, result }) => {
    // Store final results in DB
    await db.insert(resumeResults).values({
      resumeId,
      ...result
    });
  }
});
```

Benefits:
- Automatic retries on failure
- Durable execution (survives process restarts)
- Built-in progress tracking
- No custom state management needed
