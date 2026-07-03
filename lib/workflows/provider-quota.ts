import { WorkflowRetryAfterError } from "@upstash/workflow";
import {
  getProviderQuotaRetryAt,
  isProviderQuotaDeferredError,
} from "@/lib/ai/provider-quota";

export function createWorkflowQuotaRetryError(
  error: unknown,
  stepId: string,
  now = Date.now(),
) {
  if (!isProviderQuotaDeferredError(error)) return null;
  const retryAt = getProviderQuotaRetryAt(error);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((retryAt.getTime() - now) / 1_000),
  );
  return new WorkflowRetryAfterError(
    `Provider quota deferred ${stepId}`,
    retryAfterSeconds,
  );
}
