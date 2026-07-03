import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { aiProviderQuotaReservations } from "@/lib/db/app/ai-provider-quota-reservations.schema";

export type ModelProvider = "cerebras" | "groq";

export interface ProviderQuotaPolicy {
  requestsPerDay: number;
  requestsPerMinute: number;
  tokensPerDay: number;
  tokensPerHour: number;
  tokensPerMinute: number;
}

export interface ProviderQuotaRequest {
  estimatedTokens: number;
  metadata?: Record<string, unknown>;
  model: string;
  provider: ModelProvider;
  requestKey?: string;
  requestKind: "ask" | "master" | "specialist";
}

export interface ProviderQuotaReservation {
  estimatedTokens: number;
  model: string;
  policy: ProviderQuotaPolicy;
  provider: ModelProvider;
  requestKey: string;
  reservationId: string;
}

interface ProviderQuotaDecisionRow {
  granted: boolean;
  reservationId: string;
  retryAt: Date | string | null;
}

export class ProviderQuotaDeferredError extends Error {
  readonly model: string;
  readonly provider: ModelProvider;
  readonly retryAt: Date;

  constructor({
    model,
    provider,
    retryAt,
  }: {
    model: string;
    provider: ModelProvider;
    retryAt: Date;
  }) {
    super(
      `${provider}:${model} quota is reserved; retry after ${retryAt.toISOString()}`,
    );
    this.name = "ProviderQuotaDeferredError";
    this.model = model;
    this.provider = provider;
    this.retryAt = retryAt;
  }
}

export class ProviderQuotaRequestTooLargeError extends Error {
  constructor({
    estimatedTokens,
    model,
    provider,
    tokensPerMinute,
  }: {
    estimatedTokens: number;
    model: string;
    provider: ModelProvider;
    tokensPerMinute: number;
  }) {
    super(
      `${provider}:${model} request estimate ${estimatedTokens} exceeds the configured ${tokensPerMinute} TPM budget`,
    );
    this.name = "ProviderQuotaRequestTooLargeError";
  }
}

export async function reserveProviderQuota(
  request: ProviderQuotaRequest,
): Promise<ProviderQuotaReservation> {
  const maxWaitMs = getPositiveIntegerEnv("PROVIDER_QUOTA_WAIT_MAX_MS", 0);
  return reserveProviderQuotaUntil(
    { ...request, requestKey: request.requestKey ?? randomUUID() },
    maxWaitMs > 0 ? Date.now() + maxWaitMs : null,
  );
}

async function reserveProviderQuotaUntil(
  request: ProviderQuotaRequest & { requestKey: string },
  waitDeadline: number | null,
): Promise<ProviderQuotaReservation> {
  const policy = getProviderQuotaPolicy(
    request.provider,
    request.model,
    request.requestKind,
  );
  const requestKey = request.requestKey;
  const reservationId = createReservationId({ ...request, requestKey });
  const estimatedTokens = Math.max(1, Math.ceil(request.estimatedTokens));

  if (
    estimatedTokens > policy.tokensPerMinute ||
    estimatedTokens > policy.tokensPerHour ||
    estimatedTokens > policy.tokensPerDay
  ) {
    throw new ProviderQuotaRequestTooLargeError({
      estimatedTokens,
      model: request.model,
      provider: request.provider,
      tokensPerMinute: policy.tokensPerMinute,
    });
  }

  if (process.env.PROVIDER_QUOTA_SCHEDULER_ENABLED === "false") {
    return {
      estimatedTokens,
      model: request.model,
      policy,
      provider: request.provider,
      requestKey,
      reservationId: `unmanaged:${reservationId}`,
    };
  }

  const { db } = await import("@/lib/db/db");
  const result = await db.execute(sql`
    with quota_lock as materialized (
      select pg_advisory_xact_lock(
        hashtextextended(${`${request.provider}:${request.model}`}, 0)
      )
    ),
    existing as materialized (
      select ${aiProviderQuotaReservations.id} as id
      from ${aiProviderQuotaReservations}, quota_lock
      where ${aiProviderQuotaReservations.id} = ${reservationId}
      limit 1
    ),
    active as materialized (
      select
        ${aiProviderQuotaReservations.reservedAt} as reserved_at,
        case
          when ${aiProviderQuotaReservations.actualInputTokens} is not null
            or ${aiProviderQuotaReservations.actualOutputTokens} is not null
          then coalesce(${aiProviderQuotaReservations.actualInputTokens}, 0)
            + coalesce(${aiProviderQuotaReservations.actualOutputTokens}, 0)
          else ${aiProviderQuotaReservations.estimatedTokens}
        end as accounted_tokens,
        ${aiProviderQuotaReservations.blockedUntil} as blocked_until
      from ${aiProviderQuotaReservations}, quota_lock
      where ${aiProviderQuotaReservations.provider} = ${request.provider}
        and ${aiProviderQuotaReservations.model} = ${request.model}
        and ${aiProviderQuotaReservations.reservedAt} > now() - interval '1 day'
    ),
    usage as materialized (
      select
        count(*) filter (where reserved_at > now() - interval '1 minute')::integer as minute_requests,
        coalesce(sum(accounted_tokens) filter (where reserved_at > now() - interval '1 minute'), 0)::integer as minute_tokens,
        coalesce(sum(accounted_tokens) filter (where reserved_at > now() - interval '1 hour'), 0)::integer as hour_tokens,
        count(*)::integer as day_requests,
        coalesce(sum(accounted_tokens), 0)::integer as day_tokens,
        max(blocked_until) as blocked_until,
        max(reserved_at) filter (where reserved_at > now() - interval '1 minute') as last_minute_reservation,
        max(reserved_at) filter (where reserved_at > now() - interval '1 hour') as last_hour_reservation,
        max(reserved_at) as last_day_reservation
      from active
    ),
    decision as materialized (
      select
        exists(select 1 from existing) as already_reserved,
        (
          (blocked_until is null or blocked_until <= now())
          and minute_requests < ${policy.requestsPerMinute}
          and minute_tokens + ${estimatedTokens} <= ${policy.tokensPerMinute}
          and hour_tokens + ${estimatedTokens} <= ${policy.tokensPerHour}
          and day_requests < ${policy.requestsPerDay}
          and day_tokens + ${estimatedTokens} <= ${policy.tokensPerDay}
        ) as capacity_available,
        greatest(
          coalesce(blocked_until, now()),
          case when minute_requests >= ${policy.requestsPerMinute}
              or minute_tokens + ${estimatedTokens} > ${policy.tokensPerMinute}
            then coalesce(last_minute_reservation + interval '1 minute', now())
            else now() end,
          case when hour_tokens + ${estimatedTokens} > ${policy.tokensPerHour}
            then coalesce(last_hour_reservation + interval '1 hour', now())
            else now() end,
          case when day_requests >= ${policy.requestsPerDay}
              or day_tokens + ${estimatedTokens} > ${policy.tokensPerDay}
            then coalesce(last_day_reservation + interval '1 day', now())
            else now() end
        ) as retry_at
      from usage
    ),
    inserted as (
      insert into ${aiProviderQuotaReservations} (
        id,
        estimated_tokens,
        metadata,
        model,
        provider,
        request_key,
        request_kind
      )
      select
        ${reservationId},
        ${estimatedTokens},
        ${request.metadata ? JSON.stringify(request.metadata) : null}::json,
        ${request.model},
        ${request.provider},
        ${requestKey},
        ${request.requestKind}
      from decision
      where capacity_available and not already_reserved
      on conflict (id) do nothing
      returning id
    )
    select
      ${reservationId} as "reservationId",
      (already_reserved or capacity_available) as "granted",
      case when already_reserved or capacity_available then null else retry_at end as "retryAt"
    from decision
  `);
  const [decision] = toRows<ProviderQuotaDecisionRow>(result);
  if (!decision)
    throw new Error("Provider quota scheduler returned no decision");

  if (!decision.granted) {
    const retryAt = new Date(decision.retryAt ?? Date.now() + 60_000);
    const safeRetryAt = Number.isNaN(retryAt.getTime())
      ? new Date(Date.now() + 60_000)
      : retryAt;
    if (waitDeadline && safeRetryAt.getTime() <= waitDeadline) {
      await sleep(Math.max(250, safeRetryAt.getTime() - Date.now() + 250));
      return reserveProviderQuotaUntil(request, waitDeadline);
    }
    throw new ProviderQuotaDeferredError({
      model: request.model,
      provider: request.provider,
      retryAt: safeRetryAt,
    });
  }

  return {
    estimatedTokens,
    model: request.model,
    policy,
    provider: request.provider,
    requestKey,
    reservationId,
  };
}

export async function recordProviderQuotaOutcome({
  error,
  reservation,
  usage,
}: {
  error?: unknown;
  reservation: ProviderQuotaReservation;
  usage?: unknown;
}) {
  if (
    reservation.reservationId.startsWith("unmanaged:") ||
    process.env.PROVIDER_QUOTA_SCHEDULER_ENABLED === "false"
  ) {
    return;
  }

  const rateLimited = isRateLimitError(error);
  const tokenUsage = extractTokenUsage(usage);
  const retryAt = rateLimited ? getProviderRetryAt(error) : null;
  const { db } = await import("@/lib/db/db");
  await db
    .update(aiProviderQuotaReservations)
    .set({
      actualInputTokens: tokenUsage.input,
      actualOutputTokens: tokenUsage.output,
      blockedUntil: retryAt,
      completedAt: new Date(),
      errorCode: error
        ? rateLimited
          ? "rate_limited"
          : "provider_error"
        : null,
      status: error ? (rateLimited ? "rate_limited" : "failed") : "completed",
    })
    .where(
      sql`${aiProviderQuotaReservations.id} = ${reservation.reservationId}`,
    );
}

export async function runWithProviderQuota<T extends { usage?: unknown }>({
  execute,
  request,
}: {
  execute: () => Promise<T>;
  request: ProviderQuotaRequest;
}) {
  const reservation = await reserveProviderQuota(request);
  try {
    const result = await execute();
    await recordProviderQuotaOutcome({
      reservation,
      usage: result.usage,
    }).catch(() => undefined);
    return result;
  } catch (error) {
    await recordProviderQuotaOutcome({
      error,
      reservation,
      usage: getErrorUsage(error),
    }).catch(() => undefined);
    if (
      isRateLimitError(error) &&
      !reservation.reservationId.startsWith("unmanaged:")
    ) {
      throw new ProviderQuotaDeferredError({
        model: reservation.model,
        provider: reservation.provider,
        retryAt: getProviderRetryAt(error),
      });
    }
    throw error;
  }
}

export async function pruneProviderQuotaReservations({
  batchSize = 1_000,
  retentionDays = getPositiveIntegerEnv("PROVIDER_QUOTA_RETENTION_DAYS", 30),
}: {
  batchSize?: number;
  retentionDays?: number;
} = {}) {
  const safeBatchSize = Math.min(10_000, Math.max(1, Math.floor(batchSize)));
  const safeRetentionDays = Math.max(2, Math.floor(retentionDays));
  const { db } = await import("@/lib/db/db");
  const result = await db.execute(sql`
    with stale as (
      select ${aiProviderQuotaReservations.id}
      from ${aiProviderQuotaReservations}
      where ${aiProviderQuotaReservations.reservedAt}
        < now() - make_interval(days => ${safeRetentionDays})
      order by ${aiProviderQuotaReservations.reservedAt} asc
      limit ${safeBatchSize}
    )
    delete from ${aiProviderQuotaReservations}
    where ${aiProviderQuotaReservations.id} in (select id from stale)
    returning ${aiProviderQuotaReservations.id}
  `);
  return toRows(result).length;
}

export function getProviderQuotaPolicy(
  provider: ModelProvider,
  model: string,
  requestKind: ProviderQuotaRequest["requestKind"] = "specialist",
): ProviderQuotaPolicy {
  const defaults = getDefaultPolicy(provider, model);
  const prefix = provider.toUpperCase();
  const headroom =
    requestKind === "ask"
      ? getRatioEnv(`${prefix}_ASK_QUOTA_HEADROOM`, 0.95)
      : getRatioEnv(`${prefix}_QUOTA_HEADROOM`, 0.8);

  return {
    requestsPerDay: applyHeadroom(
      getPositiveIntegerEnv(`${prefix}_QUOTA_RPD`, defaults.requestsPerDay),
      headroom,
    ),
    requestsPerMinute: applyHeadroom(
      getPositiveIntegerEnv(`${prefix}_QUOTA_RPM`, defaults.requestsPerMinute),
      headroom,
    ),
    tokensPerDay: applyHeadroom(
      getPositiveIntegerEnv(`${prefix}_QUOTA_TPD`, defaults.tokensPerDay),
      headroom,
    ),
    tokensPerHour: applyHeadroom(
      getPositiveIntegerEnv(`${prefix}_QUOTA_TPH`, defaults.tokensPerHour),
      headroom,
    ),
    tokensPerMinute: applyHeadroom(
      getPositiveIntegerEnv(`${prefix}_QUOTA_TPM`, defaults.tokensPerMinute),
      headroom,
    ),
  };
}

export function estimateModelTokens(prompt: string, maxOutputTokens: number) {
  const estimatedInput = Math.ceil(prompt.length / 4);
  return Math.max(1, estimatedInput + Math.max(1, maxOutputTokens));
}

export function isProviderQuotaDeferredError(
  error: unknown,
): error is ProviderQuotaDeferredError {
  if (error instanceof ProviderQuotaDeferredError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate.name === "ProviderQuotaDeferredError" &&
    (typeof candidate.retryAt === "object" ||
      typeof candidate.retryAt === "string" ||
      typeof candidate.retryAt === "number")
  );
}

export function getProviderQuotaRetryAt(error: unknown) {
  if (!isProviderQuotaDeferredError(error)) {
    return new Date(Date.now() + 60_000);
  }
  const retryAt = new Date(
    (error as unknown as { retryAt: Date | number | string }).retryAt,
  );
  return Number.isNaN(retryAt.getTime())
    ? new Date(Date.now() + 60_000)
    : retryAt;
}

function getDefaultPolicy(
  provider: ModelProvider,
  model: string,
): ProviderQuotaPolicy {
  if (provider === "cerebras") {
    return {
      requestsPerDay: 1_000_000,
      requestsPerMinute: 5,
      tokensPerDay: 1_000_000,
      tokensPerHour: 1_000_000,
      tokensPerMinute: 30_000,
    };
  }

  if (model === "llama-3.3-70b-versatile") {
    return {
      requestsPerDay: 1_000,
      requestsPerMinute: 30,
      tokensPerDay: 100_000,
      tokensPerHour: 100_000,
      tokensPerMinute: 12_000,
    };
  }

  return {
    requestsPerDay: 1_000,
    requestsPerMinute: 30,
    tokensPerDay: 200_000,
    tokensPerHour: 200_000,
    tokensPerMinute: 8_000,
  };
}

function createReservationId(
  request: ProviderQuotaRequest & { requestKey: string },
) {
  return `quota-${createHash("sha256")
    .update(
      [
        request.provider,
        request.model,
        request.requestKind,
        request.requestKey,
      ].join("\u0000"),
    )
    .digest("hex")}`;
}

function extractTokenUsage(usage: unknown) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return { input: null, output: null };
  }
  const record = usage as Record<string, unknown>;
  return {
    input: asNonnegativeInteger(record.inputTokens),
    output: asNonnegativeInteger(record.outputTokens),
  };
}

function getErrorUsage(error: unknown) {
  if (!error || typeof error !== "object" || Array.isArray(error)) return;
  const record = error as Record<string, unknown>;
  return record.usage ?? record.totalUsage;
}

function getProviderRetryAt(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(
    /try again in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?)/i,
  );
  if (!match?.[1] || !match[2]) return new Date(Date.now() + 60_000);
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const delayMs =
    unit.startsWith("m") && unit !== "ms" && !unit.startsWith("mill")
      ? value * 60_000
      : unit === "s" || unit.startsWith("second")
        ? value * 1_000
        : value;
  return new Date(Date.now() + Math.max(1_000, Math.ceil(delayMs)));
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:429|rate limit|too many requests)\b/i.test(message);
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getRatioEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

function applyHeadroom(value: number, ratio: number) {
  return Math.max(1, Math.floor(value * ratio));
}

function asNonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function toRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
