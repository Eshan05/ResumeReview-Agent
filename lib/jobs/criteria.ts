import { z } from "zod";

export const jobRubricTemplateSchema = z.enum([
  "custom",
  "full_stack",
  "technical_intern",
  "hackerrank_style",
]);

export const jobWeightsSchema = z.object({
  education: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  projects: z.number().min(0).max(100),
  skills: z.number().min(0).max(100),
  trust: z.number().min(0).max(100),
});

export const jobCriteriaSchema = z.object({
  bonusSkills: z.array(z.string()).max(40),
  education: z.object({
    certifications: z.array(z.string()).max(20),
    preferred: z.array(z.string()).max(20),
    requirements: z.array(z.string()).max(20),
  }),
  experience: z.object({
    minYears: z.number().min(0).max(60).nullable(),
    signals: z.array(z.string()).max(30),
    targetLevel: z
      .enum(["intern", "entry", "mid", "senior", "staff", "unknown"])
      .nullable(),
  }),
  projects: z.object({
    complexity: z
      .enum(["basic", "moderate", "advanced", "production"])
      .nullable(),
    expectations: z.array(z.string()).max(30),
    preferredEvidence: z.array(z.string()).max(30),
  }),
  redFlags: z.array(z.string()).max(30),
  requiredSkills: z.array(z.string()).max(60),
  rubricTemplate: jobRubricTemplateSchema,
});

export const updateJobCriteriaRequestSchema = z.object({
  criteria: jobCriteriaSchema.optional(),
  weights: jobWeightsSchema.optional(),
});

export type JobCriteria = z.infer<typeof jobCriteriaSchema>;
export type JobRubricTemplate = z.infer<typeof jobRubricTemplateSchema>;
export type JobWeights = z.infer<typeof jobWeightsSchema>;
export type UpdateJobCriteriaRequest = z.infer<
  typeof updateJobCriteriaRequestSchema
>;

export const DEFAULT_JOB_WEIGHTS: JobWeights = {
  education: 15,
  experience: 25,
  projects: 15,
  skills: 35,
  trust: 10,
};

export const DEFAULT_JOB_CRITERIA: JobCriteria = {
  bonusSkills: ["LLM evaluation", "product judgment", "observability"],
  education: {
    certifications: [],
    preferred: ["Computer Science or adjacent engineering background"],
    requirements: [],
  },
  experience: {
    minYears: null,
    signals: [
      "shipped user-facing software",
      "clear ownership of implementation decisions",
      "production reliability habits",
    ],
    targetLevel: "senior",
  },
  projects: {
    complexity: "production",
    expectations: [
      "full-stack applications with real users or realistic workflows",
      "database-backed products",
      "API design and integration work",
      "workflow automation or agentic systems",
    ],
    preferredEvidence: [
      "live demo or deployed URL",
      "GitHub repository with meaningful commits",
      "measurable product or performance impact",
      "clear ownership and scope",
    ],
  },
  redFlags: [
    "missing contact details",
    "thin resume with little technical evidence",
    "unclear project ownership",
    "major mismatch with required role skills",
  ],
  requiredSkills: [
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Postgres",
    "API design",
    "testing",
  ],
  rubricTemplate: "full_stack",
};

export const TECHNICAL_INTERN_JOB_CRITERIA: JobCriteria = {
  bonusSkills: [
    "AI/LLM features",
    "workflow automation",
    "cloud or storage",
    "queues",
    "real-time features",
    "product judgment",
  ],
  education: {
    certifications: [],
    preferred: ["Computer Science or adjacent engineering coursework"],
    requirements: [],
  },
  experience: {
    minYears: null,
    signals: [
      "learning velocity",
      "debugging fundamentals",
      "clear project ownership",
      "ships small product features with guidance",
    ],
    targetLevel: "intern",
  },
  projects: {
    complexity: "moderate",
    expectations: [
      "deployed or demoable full-stack apps",
      "auth, forms, or data modeling",
      "API integration work",
      "readable architecture and README",
      "testing or debugging habits",
    ],
    preferredEvidence: [
      "live demo link",
      "GitHub repository",
      "clear ownership notes",
      "deployment evidence",
    ],
  },
  redFlags: [
    "missing fundamentals",
    "unclear project scope",
    "no shipped or demoable work",
    "weak technical communication",
    "unverifiable claims",
  ],
  requiredSkills: [
    "React",
    "Next.js",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "API basics",
    "SQL",
    "Git",
    "debugging",
  ],
  rubricTemplate: "technical_intern",
};

export const TECHNICAL_INTERN_JOB_WEIGHTS: JobWeights = {
  education: 15,
  experience: 15,
  projects: 30,
  skills: 30,
  trust: 10,
};

export const HACKERRANK_STYLE_JOB_CRITERIA: JobCriteria = {
  bonusSkills: [
    "Google Summer of Code",
    "Girl Script Summer of Code",
    "technical blogging",
    "portfolio website",
  ],
  education: {
    certifications: [],
    preferred: [],
    requirements: [],
  },
  experience: {
    minYears: null,
    signals: [
      "internship or production experience",
      "startup founder or early engineer experience",
      "real-world product contribution",
    ],
    targetLevel: "intern",
  },
  projects: {
    complexity: "advanced",
    expectations: [
      "meaningful open source contribution",
      "complex self-projects with real-world impact",
      "modern technology stack",
      "documentation and communication quality",
    ],
    preferredEvidence: [
      "contributions to other repositories",
      "author commit count",
      "stars, forks, contributors, or users",
      "working demo links",
    ],
  },
  redFlags: [
    "only tutorial projects",
    "personal repositories presented as open source",
    "projects without links",
    "minimal GitHub involvement",
  ],
  requiredSkills: [
    "programming fundamentals",
    "data structures",
    "full-stack development",
    "technical communication",
  ],
  rubricTemplate: "hackerrank_style",
};

export const HACKERRANK_STYLE_JOB_WEIGHTS: JobWeights = {
  education: 5,
  experience: 15,
  projects: 40,
  skills: 20,
  trust: 20,
};

export const JOB_CRITERIA_TEMPLATES = {
  full_stack: DEFAULT_JOB_CRITERIA,
  hackerrank_style: HACKERRANK_STYLE_JOB_CRITERIA,
  technical_intern: TECHNICAL_INTERN_JOB_CRITERIA,
} satisfies Record<Exclude<JobRubricTemplate, "custom">, JobCriteria>;

export const JOB_WEIGHT_TEMPLATES = {
  full_stack: DEFAULT_JOB_WEIGHTS,
  hackerrank_style: HACKERRANK_STYLE_JOB_WEIGHTS,
  technical_intern: TECHNICAL_INTERN_JOB_WEIGHTS,
} satisfies Record<Exclude<JobRubricTemplate, "custom">, JobWeights>;

export function getJobCriteriaTemplate(template: JobRubricTemplate) {
  if (template === "custom") return null;

  return cloneCriteria(JOB_CRITERIA_TEMPLATES[template]);
}

export function getJobWeightsTemplate(template: JobRubricTemplate) {
  if (template === "custom") return null;

  return { ...JOB_WEIGHT_TEMPLATES[template] };
}

const WEIGHT_KEYS = [
  "skills",
  "experience",
  "projects",
  "trust",
  "education",
] as const;

export function normalizeJobWeights(value: unknown): JobWeights {
  const parsed = jobWeightsSchema.partial().safeParse(value);
  const merged = {
    ...DEFAULT_JOB_WEIGHTS,
    ...(parsed.success ? parsed.data : {}),
  };
  const sanitized = Object.fromEntries(
    WEIGHT_KEYS.map((key) => [key, Math.max(0, Number(merged[key]) || 0)]),
  ) as JobWeights;
  const total = sumJobWeights(sanitized);

  if (total <= 0) return DEFAULT_JOB_WEIGHTS;
  if (Math.abs(total - 100) < 0.001) return roundWeights(sanitized);

  const scaled = Object.fromEntries(
    WEIGHT_KEYS.map((key) => [key, (sanitized[key] / total) * 100]),
  ) as JobWeights;

  return roundWeights(scaled);
}

export function normalizeJobCriteria(value: unknown): JobCriteria {
  const parsed = jobCriteriaSchema.partial().safeParse(value);
  const data = parsed.success ? parsed.data : {};

  return jobCriteriaSchema.parse({
    bonusSkills: normalizeStringList(data.bonusSkills).slice(0, 40),
    education: {
      certifications: normalizeStringList(data.education?.certifications),
      preferred: normalizeStringList(data.education?.preferred),
      requirements: normalizeStringList(data.education?.requirements),
    },
    experience: {
      minYears:
        typeof data.experience?.minYears === "number"
          ? data.experience.minYears
          : DEFAULT_JOB_CRITERIA.experience.minYears,
      signals: normalizeStringList(data.experience?.signals),
      targetLevel:
        data.experience?.targetLevel ??
        DEFAULT_JOB_CRITERIA.experience.targetLevel,
    },
    projects: {
      complexity:
        data.projects?.complexity ?? DEFAULT_JOB_CRITERIA.projects.complexity,
      expectations: normalizeStringList(data.projects?.expectations),
      preferredEvidence: normalizeStringList(data.projects?.preferredEvidence),
    },
    redFlags: normalizeStringList(data.redFlags),
    requiredSkills: normalizeStringList(data.requiredSkills).slice(0, 60),
    rubricTemplate: data.rubricTemplate ?? DEFAULT_JOB_CRITERIA.rubricTemplate,
  } satisfies JobCriteria);
}

export function sumJobWeights(weights: JobWeights) {
  return WEIGHT_KEYS.reduce((total, key) => total + weights[key], 0);
}

export function formatJobCriteriaForPrompt(criteria: JobCriteria) {
  return [
    `Rubric template: ${criteria.rubricTemplate}`,
    `Required skills: ${formatList(criteria.requiredSkills)}`,
    `Bonus skills: ${formatList(criteria.bonusSkills)}`,
    `Experience target: ${criteria.experience.targetLevel ?? "not specified"}${
      criteria.experience.minYears != null
        ? `, ${criteria.experience.minYears}+ years`
        : ""
    }`,
    `Experience signals: ${formatList(criteria.experience.signals)}`,
    `Project complexity: ${criteria.projects.complexity ?? "not specified"}`,
    `Project expectations: ${formatList(criteria.projects.expectations)}`,
    `Project evidence: ${formatList(criteria.projects.preferredEvidence)}`,
    `Education requirements: ${formatList(criteria.education.requirements)}`,
    `Education preferences: ${formatList(criteria.education.preferred)}`,
    `Certification preferences: ${formatList(criteria.education.certifications)}`,
    `Red flags: ${formatList(criteria.redFlags)}`,
  ].join("\n");
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function roundWeights(weights: JobWeights): JobWeights {
  const rounded = Object.fromEntries(
    WEIGHT_KEYS.map((key) => [key, Number(weights[key].toFixed(2))]),
  ) as JobWeights;
  const drift = Number((100 - sumJobWeights(rounded)).toFixed(2));

  return {
    ...rounded,
    education: Number((rounded.education + drift).toFixed(2)),
  };
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}

function cloneCriteria(criteria: JobCriteria): JobCriteria {
  return JSON.parse(JSON.stringify(criteria)) as JobCriteria;
}
