import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  command,
  ["exec", "vitest", "run", "lib/resumes/text-extraction.ocr.test.ts"],
  {
    env: {
      ...process.env,
      RUN_OCR_TESTS: "true",
    },
    shell: true,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
