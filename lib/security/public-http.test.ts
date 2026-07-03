import { describe, expect, it } from "vitest";
import {
  fetchPublicHttpUrl,
  isPublicIpAddress,
  parsePublicHttpUrl,
} from "./public-http";

describe("public HTTP URL security", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::c000:201",
    "100::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
  ])("blocks private or special-purpose address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows global unicast address %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );

  it.each([
    "http://localhost",
    "http://service.internal",
    "http://printer.local",
    "http://169.254.169.254/latest/meta-data",
    "http://example.com:8080",
    "ftp://example.com/file",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => parsePublicHttpUrl(url)).toThrow();
  });

  it("accepts ordinary public HTTP URLs", () => {
    expect(parsePublicHttpUrl("https://example.com/profile").href).toBe(
      "https://example.com/profile",
    );
  });

  it("rejects a private target before opening a socket", async () => {
    await expect(fetchPublicHttpUrl("http://127.0.0.1")).rejects.toThrow(
      /private|special-purpose/i,
    );
  });
});
