export type CanonicalSkillCategory =
  | "ai"
  | "cloud"
  | "concept"
  | "database"
  | "framework"
  | "language"
  | "other"
  | "testing"
  | "tool"
  | "workflow";

export interface CanonicalSkill {
  category: CanonicalSkillCategory;
  evidence: string;
  name: string;
}

export interface CanonicalSkills {
  all: CanonicalSkill[];
  evidence: string[];
  matched: string[];
  missing: string[];
  score: number;
  verification: string[];
}

interface BuildCanonicalSkillsInput {
  bonusSkills?: string[];
  requiredSkills?: string[];
  rawText: string;
}

interface CatalogSkill {
  category: CanonicalSkillCategory;
  name: string;
  terms: string[];
}

const SKILL_LINE_LABELS = [
  "ai",
  "cloud",
  "databases?",
  "developer tools(?:\\s*\\/\\s*platforms)?",
  "frameworks?",
  "languages?",
  "libraries",
  "platforms?",
  "technologies(?:\\s*\\/\\s*frameworks)?",
  "testing",
  "tools?",
].join("|");

const SKILL_LINE_PATTERN = new RegExp(`^(${SKILL_LINE_LABELS})\\s*:`, "i");

const SECTION_HEADER_PATTERN =
  /^(education|experience|work experience|projects?|extracurricular|achievements?|awards?|certifications?|summary|objective)\b/i;

const BROAD_INVENTORY_SKILLS = new Set(["api design", "workflow"]);

const CATALOG: CatalogSkill[] = [
  { category: "language", name: "TypeScript", terms: ["typescript", "ts"] },
  { category: "language", name: "JavaScript", terms: ["javascript", "js"] },
  { category: "language", name: "Python", terms: ["python"] },
  { category: "language", name: "Java", terms: ["java"] },
  { category: "language", name: "C", terms: ["c"] },
  { category: "language", name: "C++", terms: ["c++", "cpp", "c plus plus"] },
  { category: "language", name: "SQL", terms: ["sql"] },
  { category: "other", name: "HTML", terms: ["html", "html5"] },
  { category: "other", name: "CSS", terms: ["css", "css3"] },
  {
    category: "framework",
    name: "React",
    terms: ["react", "react.js", "reactjs"],
  },
  { category: "framework", name: "Next.js", terms: ["next.js", "nextjs"] },
  { category: "framework", name: "Vue.js", terms: ["vuejs", "vue.js", "vue"] },
  {
    category: "framework",
    name: "Nuxt.js",
    terms: ["nuxt.js", "nuxtjs", "nuxt"],
  },
  { category: "framework", name: "Angular", terms: ["angular"] },
  { category: "framework", name: "NestJS", terms: ["nestjs", "nest.js"] },
  {
    category: "framework",
    name: "Node.js",
    terms: ["node.js", "nodejs", "node"],
  },
  {
    category: "framework",
    name: "Express.js",
    terms: ["express.js", "expressjs", "express"],
  },
  {
    category: "framework",
    name: "Tailwind CSS",
    terms: ["tailwind css", "tailwindcss", "tailwind"],
  },
  { category: "framework", name: "Redux", terms: ["redux"] },
  { category: "framework", name: "Quasar", terms: ["quasar"] },
  { category: "framework", name: "Bootstrap", terms: ["bootstrap"] },
  { category: "framework", name: "Mongoose", terms: ["mongoose"] },
  { category: "framework", name: "Zod", terms: ["zod"] },
  { category: "framework", name: "shadcn/ui", terms: ["shadcn", "shadcn/ui"] },
  { category: "framework", name: "SCSS", terms: ["scss", "sass"] },
  { category: "framework", name: "Recharts", terms: ["recharts"] },
  { category: "framework", name: "ApexCharts", terms: ["apexcharts"] },
  { category: "framework", name: "Reka UI", terms: ["reka ui"] },
  {
    category: "database",
    name: "PostgreSQL",
    terms: ["postgresql", "postgres"],
  },
  {
    category: "database",
    name: "MongoDB",
    terms: ["mongodb", "mongo db", "mongo"],
  },
  {
    category: "database",
    name: "MongoDB Atlas",
    terms: ["mongo atlas", "mongodb atlas"],
  },
  { category: "database", name: "Redis", terms: ["redis"] },
  { category: "database", name: "Neon", terms: ["neon"] },
  { category: "database", name: "Convex", terms: ["convex"] },
  { category: "database", name: "Drizzle", terms: ["drizzle"] },
  { category: "database", name: "TypeORM", terms: ["typeorm", "type orm"] },
  { category: "cloud", name: "AWS", terms: ["aws", "amazon web services"] },
  { category: "cloud", name: "AWS S3", terms: ["aws s3", "s3"] },
  { category: "cloud", name: "Vercel", terms: ["vercel"] },
  { category: "cloud", name: "Supabase", terms: ["supabase"] },
  { category: "tool", name: "Git", terms: ["git"] },
  { category: "tool", name: "GitHub", terms: ["github"] },
  { category: "tool", name: "pgAdmin", terms: ["pgadmin", "pgadmin4"] },
  { category: "tool", name: "Postman", terms: ["postman"] },
  { category: "tool", name: "Mailgun", terms: ["mailgun"] },
  { category: "tool", name: "Figma", terms: ["figma"] },
  { category: "tool", name: "Rocicorp Zero", terms: ["rocicorp zero", "zero"] },
  { category: "tool", name: "Upstash", terms: ["upstash"] },
  { category: "testing", name: "Jest", terms: ["jest"] },
  { category: "testing", name: "Vitest", terms: ["vitest"] },
  { category: "testing", name: "Playwright", terms: ["playwright"] },
  { category: "testing", name: "Cypress", terms: ["cypress"] },
  { category: "ai", name: "AI", terms: ["artificial intelligence", "ai"] },
  { category: "ai", name: "LLM", terms: ["llm", "large language model"] },
  {
    category: "ai",
    name: "RAG",
    terms: ["rag", "retrieval augmented generation"],
  },
  { category: "workflow", name: "CI/CD", terms: ["ci/cd", "ci cd"] },
  { category: "workflow", name: "Workflow", terms: ["workflow", "workflows"] },
  {
    category: "concept",
    name: "REST API",
    terms: ["rest api", "rest apis", "restful"],
  },
  { category: "concept", name: "API design", terms: ["api design"] },
  { category: "concept", name: "gRPC", terms: ["grpc"] },
  { category: "concept", name: "GraphQL", terms: ["graphql"] },
  {
    category: "concept",
    name: "WebSockets",
    terms: ["websocket", "websockets"],
  },
  {
    category: "concept",
    name: "Authentication",
    terms: ["authentication", "auth"],
  },
  { category: "concept", name: "RBAC", terms: ["rbac"] },
  { category: "concept", name: "DSA", terms: ["dsa", "data structures"] },
];

export function buildCanonicalSkills({
  bonusSkills = [],
  rawText,
  requiredSkills = [],
}: BuildCanonicalSkillsInput): CanonicalSkills {
  const all = extractCanonicalSkillInventory(rawText);
  const required = normalizeSkillList(requiredSkills);
  const support = required.map((skill) => ({
    skill,
    supportingSkills: getSupportingInventorySkills(skill, all, rawText),
  }));
  const supported = support.filter((item) => item.supportingSkills.length > 0);
  const missing = support
    .filter((item) => item.supportingSkills.length === 0)
    .map((item) => item.skill);
  const matched = uniqueStrings(
    supported.flatMap((item) =>
      item.supportingSkills.map((skill) => skill.name),
    ),
  ).slice(0, 20);
  const score =
    required.length > 0
      ? clampScore((supported.length / Math.max(1, required.length)) * 100)
      : all.length > 0
        ? 100
        : 0;
  const verification = [
    ...supported.map(
      (item) =>
        `${item.skill}: supported by ${item.supportingSkills
          .map((skill) => skill.name)
          .join(", ")}`,
    ),
    ...missing.map((skill) => `${skill}: missing direct resume skill evidence`),
    ...normalizeSkillList(bonusSkills)
      .filter(
        (skill) => getSupportingInventorySkills(skill, all, rawText).length > 0,
      )
      .map((skill) => `${skill}: bonus skill signal present`),
  ].slice(0, 10);

  return {
    all,
    evidence: uniqueStrings(all.map((skill) => skill.evidence)).slice(0, 10),
    matched,
    missing: missing.slice(0, 20),
    score,
    verification,
  };
}

export function extractCanonicalSkillInventory(
  rawText: string,
): CanonicalSkill[] {
  const candidates = [
    ...extractSkillSectionCandidates(rawText),
    ...extractProjectStackCandidates(rawText),
  ];

  return normalizeInventory(candidates);
}

export function normalizeCanonicalSkillName(value: string) {
  const cleaned = value
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(and|or)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    "amazon web services": "AWS",
    "api design": "API design",
    "aws s3": "AWS S3",
    "c plus plus": "C++",
    convex: "Convex",
    css3: "CSS",
    express: "Express.js",
    "express.js": "Express.js",
    expressjs: "Express.js",
    html5: "HTML",
    javascript: "JavaScript",
    "mongo atlas": "MongoDB Atlas",
    mongo: "MongoDB",
    "mongodb atlas": "MongoDB Atlas",
    nestjs: "NestJS",
    "nest.js": "NestJS",
    nextjs: "Next.js",
    "next.js": "Next.js",
    node: "Node.js",
    "node.js": "Node.js",
    nodejs: "Node.js",
    pgadmin4: "pgAdmin",
    postgres: "PostgreSQL",
    postgresql: "PostgreSQL",
    reactjs: "React",
    "react.js": "React",
    shadcn: "shadcn/ui",
    tailwind: "Tailwind CSS",
    tailwindcss: "Tailwind CSS",
    ts: "TypeScript",
    typescript: "TypeScript",
    vuejs: "Vue.js",
    "vue.js": "Vue.js",
  };

  return aliases[cleaned.toLowerCase()] ?? cleaned;
}

function extractSkillSectionCandidates(rawText: string) {
  const lines = getCleanLines(rawText);
  const candidates: CanonicalSkill[] = [];
  let inSkillSection = false;
  let currentLabel: string | null = null;

  for (const line of lines) {
    if (/^technical skills\b|^skills\b/i.test(line)) {
      inSkillSection = true;
      currentLabel = null;
      continue;
    }

    if (inSkillSection && SECTION_HEADER_PATTERN.test(line)) {
      break;
    }

    const labelMatch = line.match(SKILL_LINE_PATTERN);
    if (labelMatch) {
      currentLabel = labelMatch[1];
      candidates.push(
        ...skillsFromSkillText({
          evidence: line,
          sourceText: line.slice(line.indexOf(":") + 1),
        }),
      );
      continue;
    }

    if (inSkillSection && currentLabel && !/^[•-]/.test(line)) {
      candidates.push(
        ...skillsFromSkillText({
          evidence: `${currentLabel}: ${line}`,
          sourceText: line,
        }),
      );
    }
  }

  return candidates;
}

function extractProjectStackCandidates(rawText: string) {
  return getCleanLines(rawText)
    .filter((line) => /\|/.test(line) && hasMonthOrYear(line))
    .flatMap((line) =>
      findCatalogSkills(line).map((skill) => ({
        category: skill.category,
        evidence: line,
        name: skill.name,
      })),
    );
}

function skillsFromSkillText({
  evidence,
  sourceText,
}: {
  evidence: string;
  sourceText: string;
}) {
  const direct = splitSkillValue(sourceText).map(normalizeCanonicalSkillName);
  const directSkills = direct
    .map((name) => catalogSkillForName(name))
    .filter((skill): skill is CatalogSkill => Boolean(skill))
    .map((skill) => ({
      category: skill.category,
      evidence,
      name: skill.name,
    }));
  const detected = findCatalogSkills(sourceText).map((skill) => ({
    category: skill.category,
    evidence,
    name: skill.name,
  }));

  return [...directSkills, ...detected];
}

function findCatalogSkills(text: string) {
  return CATALOG.filter((skill) =>
    skill.terms.some((term) => hasSkillTerm(text, term)),
  );
}

function catalogSkillForName(name: string) {
  const key = skillKey(name);
  return CATALOG.find((skill) => skillKey(skill.name) === key);
}

function getSupportingInventorySkills(
  requiredSkill: string,
  all: CanonicalSkill[],
  rawText: string,
) {
  const requiredKey = skillKey(requiredSkill);
  const direct = all.filter((skill) => skillKey(skill.name) === requiredKey);
  if (direct.length > 0) return direct;

  const names = new Set(all.map((skill) => skillKey(skill.name)));
  const find = (values: string[]) =>
    all.filter((skill) =>
      values.some((value) => skillKey(value) === skillKey(skill.name)),
    );

  if (
    requiredKey === skillKey("API basics") ||
    requiredKey === skillKey("API")
  ) {
    const support = find([
      "Node.js",
      "NestJS",
      "Express.js",
      "Postman",
      "REST API",
    ]);
    return /\bapi|apis|endpoint|dto|postman|rest\b/i.test(rawText)
      ? support
      : [];
  }

  if (requiredKey === skillKey("debugging")) {
    const support = find([
      "Postman",
      "Jest",
      "Vitest",
      "Playwright",
      "Cypress",
    ]);
    return /\bdebug|test|testing|postman|troubleshoot\b/i.test(rawText)
      ? support
      : [];
  }

  if (requiredKey === skillKey("full-stack development")) {
    const frontend = ["React", "Next.js", "Vue.js", "Nuxt.js", "Angular"].some(
      (skill) => names.has(skillKey(skill)),
    );
    const backend = ["Node.js", "NestJS", "Express.js"].some((skill) =>
      names.has(skillKey(skill)),
    );
    return frontend && backend
      ? find([
          "React",
          "Next.js",
          "Vue.js",
          "Nuxt.js",
          "Angular",
          "Node.js",
          "NestJS",
          "Express.js",
        ])
      : [];
  }

  if (requiredKey === skillKey("programming fundamentals")) {
    return find(["Python", "JavaScript", "TypeScript", "Java", "C", "C++"]);
  }

  if (requiredKey === skillKey("data structures")) {
    return /\bdata structures?|dsa|algorithms?\b/i.test(rawText)
      ? find(["Python", "JavaScript", "TypeScript", "Java", "C", "C++", "DSA"])
      : [];
  }

  return [];
}

function normalizeInventory(values: CanonicalSkill[]) {
  const seen = new Set<string>();
  const normalized: CanonicalSkill[] = [];

  for (const value of values) {
    const name = normalizeCanonicalSkillName(value.name);
    const key = skillKey(name);
    if (!name || seen.has(key)) continue;
    if (
      BROAD_INVENTORY_SKILLS.has(key) &&
      !hasExplicitBroadEvidence(name, value.evidence)
    ) {
      continue;
    }
    seen.add(key);
    normalized.push({
      category: value.category,
      evidence: value.evidence,
      name,
    });
  }

  return normalized.slice(0, 60);
}

function hasExplicitBroadEvidence(name: string, evidence: string) {
  const key = skillKey(name);
  if (key === skillKey("API design")) return /\bapi design\b/i.test(evidence);
  if (key === skillKey("Workflow")) return /\bworkflows?\b/i.test(evidence);
  return true;
}

function splitSkillValue(value: string) {
  return value
    .replace(/\b(and|or)\b/gi, ",")
    .split(/[,;|]/)
    .flatMap((item) => item.split(/\s+\/\s+|\/(?=[A-Z+#])/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSkillList(values: string[]) {
  return uniqueStrings(
    values.flatMap(splitSkillValue).map(normalizeCanonicalSkillName),
  );
}

function getCleanLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && line.length <= 240);
}

function hasSkillTerm(text: string, term: string) {
  const cleaned = term.trim().toLowerCase();
  if (!cleaned) return false;
  return new RegExp(
    `(^|[^a-z0-9+#.])${escapeRegExp(cleaned)}([^a-z0-9+#.]|$)`,
    "i",
  ).test(text);
}

function hasMonthOrYear(text: string) {
  return /\b(?:jan|feb|mar|apr|may|jun|june|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b20\d{2}\b/i.test(
    text,
  );
}

function skillKey(value: string) {
  return normalizeCanonicalSkillName(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, "");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
