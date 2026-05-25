const cleanUrlForCookieDomain = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  const domain = url.replace(/^https?:\/\//, '');
  const cleanedDomain = domain.replace(/\/$/, '');
  return `.${cleanedDomain}`;
};

export const baseURL: string | undefined =
  process.env.VERCEL === "1"
    ? process.env.VERCEL_ENV === "production"
      ? process.env.BETTER_AUTH_URL
      : process.env.VERCEL_ENV === "preview"
        ? `https://${process.env.VERCEL_URL}`
        : undefined
    : undefined;

export const cookieDomain: string | undefined =
  process.env.VERCEL === "1"
    ? process.env.VERCEL_ENV === "production"
      ? cleanUrlForCookieDomain(process.env.NEXT_PUBLIC_BETTER_AUTH_BASE)
      : process.env.VERCEL_ENV === "preview"
        ? `.${process.env.VERCEL_URL}`
        : undefined
    : undefined;


export const authBaseUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_BETTER_AUTH_BASE ||
  baseURL ||
  "http://localhost:3000";
export const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  "local-development-secret-change-before-production-123456789";