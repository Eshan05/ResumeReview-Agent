import { describe, expect, it } from "vitest";
import { crawlPlatformUrl, extractPlatformLinks } from "./platform-crawlers";

describe("platform crawlers", () => {
  it("extracts all supported public platform links from resume text", () => {
    const links = extractPlatformLinks(`
      Eshan Nahar
      /Eshan05
      LinkedIn: /in/eshann7
      LeetCode: https://leetcode.com/u/es_nahar/
      HackerRank: https://www.hackerrank.com/profile/es_nahar
      HuggingFace: https://huggingface.co/es-nahar
      Portfolio: https://eshan.example.dev
      Education
    `);

    expect(links.github).toBe("https://github.com/Eshan05");
    expect(links.linkedin).toBe("https://linkedin.com/in/eshann7");
    expect(links.leetcode).toBe("https://leetcode.com/u/es_nahar/");
    expect(links.hackerrank).toBe(
      "https://www.hackerrank.com/profile/es_nahar",
    );
    expect(links.huggingface).toBe("https://huggingface.co/es-nahar");
    expect(links.portfolio).toBe("https://eshan.example.dev");
  });

  it("validates LinkedIn URLs without scraping LinkedIn", async () => {
    const result = await crawlPlatformUrl("https://linkedin.com/in/eshann7");

    expect(result?.status).toBe("completed");
    expect(result?.content).toContain("No LinkedIn scraping was attempted.");
  });
});
