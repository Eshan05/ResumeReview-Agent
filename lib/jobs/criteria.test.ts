import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOB_CRITERIA,
  getJobWeightsTemplate,
  normalizeJobCriteria,
  normalizeJobWeights,
  sumJobWeights,
} from "./criteria";

describe("job criteria", () => {
  it("normalizes legacy four-part weights into the five-part scoring contract", () => {
    const weights = normalizeJobWeights({
      experience: 30,
      projects: 20,
      skills: 40,
      trust: 10,
    });

    expect(sumJobWeights(weights)).toBe(100);
    expect(weights.education).toBeGreaterThan(0);
    expect(weights.skills).toBeGreaterThan(weights.projects);
  });

  it("fills missing criteria with platform defaults", () => {
    const criteria = normalizeJobCriteria({
      requiredSkills: ["React", "React", " TypeScript "],
      rubricTemplate: "technical_intern",
    });

    expect(criteria.requiredSkills).toEqual(["React", "TypeScript"]);
    expect(criteria.bonusSkills).toEqual([]);
    expect(criteria.education).toEqual({
      certifications: [],
      preferred: [],
      requirements: [],
    });
    expect(DEFAULT_JOB_CRITERIA.projects.expectations.length).toBeGreaterThan(
      0,
    );
  });

  it("keeps preset rubric weights explicit and normalized", () => {
    const internWeights = getJobWeightsTemplate("technical_intern");
    const hackerrankWeights = getJobWeightsTemplate("hackerrank_style");

    expect(internWeights).not.toBeNull();
    expect(hackerrankWeights).not.toBeNull();
    expect(internWeights && sumJobWeights(internWeights)).toBe(100);
    expect(hackerrankWeights && sumJobWeights(hackerrankWeights)).toBe(100);
    expect(internWeights?.projects).toBeGreaterThan(
      internWeights?.experience ?? 0,
    );
    expect(hackerrankWeights?.projects).toBeGreaterThan(
      hackerrankWeights?.skills ?? 0,
    );
  });
});
