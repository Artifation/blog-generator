import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, assertPublicUrl, SsrfError } from "../ssrf";

test("isPublicIp blocks loopback / private / link-local / CGNAT / ULA", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.5.4",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // carrier-grade NAT
    "0.0.0.0",
    "::1",
    "fc00::1", // unique local
    "fe80::1", // link-local
    "::ffff:127.0.0.1", // IPv4-mapped loopback
  ]) {
    assert.equal(isPublicIp(ip), false, `${ip} should be blocked`);
  }
});

test("isPublicIp allows real public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    assert.equal(isPublicIp(ip), true, `${ip} should be allowed`);
  }
});

test("isPublicIp rejects garbage", () => {
  assert.equal(isPublicIp("not-an-ip"), false);
  assert.equal(isPublicIp(""), false);
});

test("assertPublicUrl rejects non-http(s) protocols", async () => {
  await assert.rejects(() => assertPublicUrl("ftp://example.com/x"), SsrfError);
  await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), SsrfError);
});

test("assertPublicUrl rejects literal internal IP targets", async () => {
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1/"), SsrfError);
  await assert.rejects(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/"), SsrfError);
  await assert.rejects(() => assertPublicUrl("http://[::1]/"), SsrfError);
  await assert.rejects(() => assertPublicUrl("http://10.0.0.5:8080/admin"), SsrfError);
});

test("assertPublicUrl accepts a public literal IP", async () => {
  const url = await assertPublicUrl("http://8.8.8.8/");
  assert.equal(url.hostname, "8.8.8.8");
});
