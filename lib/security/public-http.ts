import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { Address4, Address6 } from "ip-address";

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 12_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_IPV4_NETWORKS = [
  "0.0.0.0/8",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.31.196.0/24",
  "192.52.193.0/24",
  "192.88.99.0/24",
  "192.175.48.0/24",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "240.0.0.0/4",
].map((network) => new Address4(network));

const BLOCKED_IPV6_NETWORKS = [
  "64:ff9b::/96",
  "64:ff9b:1::/48",
  "100::/64",
  "2001:2::/48",
  "2001:10::/28",
  "2001:db8::/32",
  "fec0::/10",
].map((network) => new Address6(network));

const BLOCKED_HOST_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
  ".home.arpa",
];

export interface PublicHttpFetchOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface PublicHttpResult {
  body?: Buffer;
  headers: Headers;
  location?: string;
  statusCode: number;
}

export async function fetchPublicHttpUrl(
  input: string | URL,
  options: PublicHttpFetchOptions = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Public URL request timed out")),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) abortFromCaller();

  try {
    let current = parsePublicHttpUrl(input);
    const visited = new Set<string>();
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    for (let redirectCount = 0; ; redirectCount += 1) {
      if (visited.has(current.href)) {
        throw new Error("Public URL redirect loop detected");
      }
      visited.add(current.href);

      const result = await requestPublicUrl(current, {
        headers: options.headers,
        maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
        signal: controller.signal,
      });

      if (result.location && REDIRECT_STATUSES.has(result.statusCode)) {
        if (redirectCount >= maxRedirects) {
          throw new Error("Public URL exceeded the redirect limit");
        }

        current = parsePublicHttpUrl(new URL(result.location, current));
        continue;
      }

      return new Response(result.body?.toString("utf8"), {
        headers: result.headers,
        status: result.statusCode,
      });
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function parsePublicHttpUrl(input: string | URL) {
  const url = input instanceof URL ? new URL(input.href) : new URL(input);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP and HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("Public URLs cannot include credentials");
  }
  if (url.port) {
    throw new Error("Public URLs must use the standard HTTP or HTTPS port");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new Error("Public URL hostname is required");

  if (Address4.isValid(hostname) || Address6.isValid(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error("Private or special-purpose IP addresses are blocked");
    }
    return url;
  }

  if (
    hostname === "localhost" ||
    !hostname.includes(".") ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Private or local hostnames are blocked");
  }

  return url;
}

export function isPublicIpAddress(value: string) {
  const address = normalizeHostname(value);

  if (Address4.isValid(address)) {
    const ipv4 = new Address4(address);
    return !(
      ipv4.isPrivate() ||
      ipv4.isLoopback() ||
      ipv4.isLinkLocal() ||
      ipv4.isMulticast() ||
      ipv4.isUnspecified() ||
      ipv4.isBroadcast() ||
      ipv4.isCGNAT() ||
      BLOCKED_IPV4_NETWORKS.some((network) => ipv4.isInSubnet(network))
    );
  }

  if (Address6.isValid(address)) {
    const ipv6 = new Address6(address);
    return !(
      ipv6.zone ||
      ipv6.is4() ||
      ipv6.isMapped4() ||
      ipv6.isTeredo() ||
      ipv6.is6to4() ||
      ipv6.isLoopback() ||
      ipv6.isULA() ||
      ipv6.isLinkLocal() ||
      ipv6.isMulticast() ||
      ipv6.isUnspecified() ||
      ipv6.isDocumentation() ||
      BLOCKED_IPV6_NETWORKS.some((network) => ipv6.isInSubnet(network))
    );
  }

  return false;
}

function requestPublicUrl(
  url: URL,
  {
    headers,
    maxBytes,
    signal,
  }: {
    headers?: Record<string, string>;
    maxBytes: number;
    signal: AbortSignal;
  },
) {
  return new Promise<PublicHttpResult>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        headers,
        lookup: publicAddressLookup,
        method: "GET",
        signal,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const responseHeaders = toHeaders(response.headers);
        const location = responseHeaders.get("location") ?? undefined;

        if (location && REDIRECT_STATUSES.has(statusCode)) {
          response.resume();
          resolve({ headers: responseHeaders, location, statusCode });
          return;
        }

        const contentLength = Number(responseHeaders.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.destroy();
          reject(new Error("Public URL response exceeded the size limit"));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let settled = false;

        response.on("data", (chunk: Buffer | Uint8Array | string) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (totalBytes > maxBytes) {
            settled = true;
            response.destroy();
            reject(new Error("Public URL response exceeded the size limit"));
            return;
          }
          chunks.push(buffer);
        });
        response.once("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            body: Buffer.concat(chunks),
            headers: responseHeaders,
            statusCode,
          });
        });
        response.once("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      },
    );

    request.once("error", reject);
    request.end();
  });
}

const publicAddressLookup: LookupFunction = (hostname, options, callback) => {
  const requestedFamily =
    options.family === "IPv4"
      ? 4
      : options.family === "IPv6"
        ? 6
        : (options.family ?? 0);

  dnsLookup(
    hostname,
    {
      all: true,
      family: requestedFamily,
      hints: options.hints,
      order: "verbatim",
    },
    (error, addresses) => {
      if (error) {
        callback(error, "", 0);
        return;
      }

      if (
        addresses.length === 0 ||
        addresses.some((address) => !isPublicIpAddress(address.address))
      ) {
        callback(createBlockedAddressError(hostname), "", 0);
        return;
      }

      if (options.all) {
        callback(null, addresses);
        return;
      }

      const selected = addresses[0];
      callback(null, selected.address, selected.family);
    },
  );
};

function createBlockedAddressError(hostname: string) {
  const error = new Error(
    `Hostname ${hostname} resolved to a private or special-purpose address`,
  ) as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function toHeaders(headers: import("node:http").IncomingHttpHeaders) {
  const result = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }

  return result;
}
