import dotenv from "dotenv";
import { pruneProviderQuotaReservations } from "@/lib/ai/provider-quota";

dotenv.config({ path: ".env.local" });

async function main() {
  let deleted = 0;
  for (let batch = 0; batch < 100; batch += 1) {
    const count = await pruneProviderQuotaReservations();
    deleted += count;
    if (count < 1_000) break;
  }
  process.stdout.write(`Pruned ${deleted} provider quota reservations.\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : "Provider quota cleanup failed"}\n`,
  );
  process.exitCode = 1;
});
