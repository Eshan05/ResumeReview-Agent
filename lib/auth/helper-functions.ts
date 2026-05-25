// No Vercel-specific imports; background tasks will run inline.
export const backgroundTasksHandler = (promise: Promise<unknown>) => {
  // Always avoid unhandled rejections.
  void promise.catch(() => undefined);
};

type BackgroundTaskHandler = (promise: Promise<unknown>) => void;

type BetterAuthSessionLike = {
  user?: { id?: string; email?: string; name?: string };
  session?: { id?: string; userId?: string };
};

type BetterAuthHookContextLike = {
  returned?: unknown;
  newSession?: BetterAuthSessionLike | null;
  session?: BetterAuthSessionLike | null;
};

type AuthReturnedJsonLike = {
  user?: { id?: string; email?: string; name?: string };
  session?: { id?: string };
  account?: { id?: string; accountId?: string; providerId?: string; userId?: string };
  accounts?: Array<{ id?: string; accountId?: string; providerId?: string; userId?: string }>;
};

export type AuthAuditLogInsert = {
  accountId?: string;
  actorUserId?: string;
  email?: string;
  event: string;
  ipAddress?: string;
  metadata?: string;
  method: string;
  path: string;
  providerId?: string;
  sessionId?: string;
  targetUserId?: string;
  userAgent?: string;
};

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json');
}

function pickAccountInfo(payload: AuthReturnedJsonLike | undefined): Record<string, unknown> | undefined {
  const account = payload?.account ?? payload?.accounts?.[0];
  if (!account) return;
  const out: Record<string, unknown> = {};
  if (account.accountId) out.accountId = account.accountId;
  if (account.providerId) out.providerId = account.providerId;
  if (account.id) out.accountRowId = account.id;
  if (account.userId) out.accountUserId = account.userId;
  return Object.keys(out).length ? out : undefined;
}

function toHeaderBag(headers: unknown): Record<string, string | undefined> {
  if (!headers) return {};
  // Better Auth ctx.headers is documented as "headers", but the runtime type can vary.
  if (headers instanceof Headers) {
    return Object.fromEntries(Array.from(headers.entries())) as Record<string, string>;
  }

  if (typeof headers === 'object') return headers as Record<string, string | undefined>;
  return {};
}

function toHeadersInit(headers: unknown): HeadersInit {
  if (!headers) return {};
  if (headers instanceof Headers) return headers;
  if (Array.isArray(headers)) return headers as [string, string][];
  if (typeof headers === 'object') {
    const obj = headers as Record<string, unknown>;
    const pairs: [string, string][] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') pairs.push([k, v]);
    }
    return pairs;
  }
  return {};
}

function redactAuthBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return;
  const obj = body as Record<string, unknown>;

  // Keep it intentionally small: no passwords/tokens/codes.
  const safe: Record<string, unknown> = {};
  if (typeof obj.email === 'string') safe.email = obj.email;
  if (typeof obj.providerId === 'string') safe.providerId = obj.providerId;
  if (typeof obj.accountId === 'string') safe.accountId = obj.accountId;
  return Object.keys(safe).length ? safe : undefined;
}

function normalizeForwardedFor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split(',')[0]?.trim() || undefined;
}

function resolveAuditEvent(path: string, payload?: AuthReturnedJsonLike): string | null {
  if (path === '/sign-up/email') return 'auth.sign_up.email';
  if (path === '/sign-in/email') return 'auth.sign_in.email';
  if (path === '/sign-in/social') return 'auth.sign_in.social';
  if (path.startsWith('/callback/') && pickAccountInfo(payload)?.providerId) {
    return 'auth.sign_in.social';
  }
  return null;
}

async function readReturnedPayload(returned: unknown): Promise<AuthReturnedJsonLike | undefined> {
  if (!returned) return undefined;

  if (returned instanceof Response) {
    if (!isJsonResponse(returned)) return undefined;

    try {
      return (await returned.clone().json()) as AuthReturnedJsonLike;
    } catch {
      return undefined;
    }
  }

  if (typeof returned === 'object') {
    return returned as AuthReturnedJsonLike;
  }

  return undefined;
}

function safeJsonStringify(value: unknown): string | undefined {
  if (!value) return undefined;

  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export async function buildAuthAuditLog({
  body,
  context,
  headers,
  method,
  path,
}: {
  body?: unknown;
  context?: BetterAuthHookContextLike;
  headers?: unknown;
  method?: string;
  path: string;
}): Promise<AuthAuditLogInsert | null> {
  const payload = await readReturnedPayload(context?.returned);
  const event = resolveAuditEvent(path, payload);

  if (!event) return null;

  const account = pickAccountInfo(payload);
  const safeBody = redactAuthBody(body);
  const headerBag = toHeaderBag(headers);
  const session = context?.newSession?.session ?? payload?.session ?? context?.session?.session;
  const user = context?.newSession?.user ?? payload?.user ?? context?.session?.user;
  const metadata = safeJsonStringify({
    account,
    body: safeBody,
  });

  if (!user?.id && !session?.id && !account && event !== 'auth.sign_in.social') {
    return null;
  }

  return {
    accountId:
      (safeBody?.accountId as string | undefined) ??
      (account?.accountId as string | undefined),
    actorUserId: context?.session?.session?.userId ?? context?.session?.user?.id ?? user?.id,
    email: user?.email ?? (safeBody?.email as string | undefined),
    event,
    ipAddress: normalizeForwardedFor(headerBag['x-forwarded-for']) ?? headerBag['x-real-ip'],
    metadata,
    method: method ?? 'POST',
    path,
    providerId:
      (safeBody?.providerId as string | undefined) ??
      (account?.providerId as string | undefined),
    sessionId: session?.id,
    targetUserId: user?.id ?? (account?.accountUserId as string | undefined),
    userAgent: headerBag['user-agent'],
  };
}