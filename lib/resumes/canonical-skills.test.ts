import { describe, expect, it } from "vitest";
import {
  buildCanonicalSkills,
  extractCanonicalSkillInventory,
  normalizeCanonicalSkillName,
} from "./canonical-skills";

const resumeText = `
Eshan Nahar
Projects
Event Space | Visit W | Next.js, Zero, ShadCN, Tailwind, TypeScript, Drizzle, Neon, Redis June 2025
LeanURL | Visit W | Nuxt.js, Mongo, Tailwind CSS, Apexcharts, Reka UI April 2025
Technical Skills
Languages : Python, C/C++, HTML/CSS, JavaScript/Typescript, Node, SQL
Developer Tools / Platforms : Neon, Vercel, Git, PGAdmin4, Postman, Supabase, Mongo Atlas, Convex, Upstash
Technologies/Frameworks : React, Redux, VueJS, Tailwind CSS, SCSS, NestJS, Angular, Bootstrap, ShadCN,
Mongoose, PostgreSQL, Express, Zod, Next.js
Extracurricular
`;

describe("canonical skills", () => {
  it("extracts skills from explicit resume skill sections", () => {
    const names = extractCanonicalSkillInventory(resumeText).map(
      (skill) => skill.name,
    );

    expect(names).toEqual(
      expect.arrayContaining([
        "React",
        "Next.js",
        "TypeScript",
        "JavaScript",
        "Node.js",
        "SQL",
        "Git",
        "Postman",
        "PostgreSQL",
      ]),
    );
  });

  it("uses project tech stacks as secondary skill inventory", () => {
    const names = extractCanonicalSkillInventory(`
Projects
Realtime Chat | Demo | Next.js, TypeScript, Drizzle, Neon, Redis June 2025
Technical Skills
Languages : JavaScript
`);

    expect(names.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["Next.js", "TypeScript", "Drizzle", "Neon"]),
    );
  });

  it("normalizes common aliases", () => {
    expect(normalizeCanonicalSkillName("TS")).toBe("TypeScript");
    expect(normalizeCanonicalSkillName("NextJS")).toBe("Next.js");
    expect(normalizeCanonicalSkillName("React.js")).toBe("React");
    expect(normalizeCanonicalSkillName("Node")).toBe("Node.js");
    expect(normalizeCanonicalSkillName("Postgres")).toBe("PostgreSQL");
  });

  it("does not let broad generated labels pollute canonical skills", () => {
    const result = buildCanonicalSkills({
      rawText: resumeText,
      requiredSkills: ["React", "Workflow", "API basics"],
    });
    const names = result.all.map((skill) => skill.name);

    expect(names).toContain("React");
    expect(names).not.toContain("Workflow");
    expect(names).not.toContain("API design");
    expect(result.matched).toEqual(
      expect.arrayContaining(["React", "Node.js", "NestJS", "Postman"]),
    );
    expect(result.missing).toContain("Workflow");
  });

  it("scores required criteria from canonical inventory and broad support rules", () => {
    const result = buildCanonicalSkills({
      rawText: `${resumeText}\nConducted API testing via Postman.`,
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
    });

    expect(result.score).toBe(100);
    expect(result.missing).toEqual([]);
    expect(result.verification.join("\n")).toContain(
      "API basics: supported by",
    );
  });
});
