import { afterEach, describe, expect, it } from "vitest";
import {
  decryptConnectionData,
  encryptConnectionData,
  isEncryptedConnectionData,
} from "../../src/lib/db/helpers/credentialVault.js";

afterEach(() => {
  delete process.env.NINEROUTER_VAULT_KEY;
  delete process.env.ROUTER_SECRET;
});

describe("tenant credential vault", () => {
  it("encrypts credential fields and binds ciphertext to tenant and connection", () => {
    process.env.NINEROUTER_VAULT_KEY = "test-only-key-material-that-is-long-enough";
    const payload = { accessToken: "access-secret", refreshToken: "refresh-secret", scope: "openid" };
    const encrypted = encryptConnectionData(payload, { tenantId: "10001", connectionId: "connection-a" });
    expect(isEncryptedConnectionData(encrypted)).toBe(true);
    expect(encrypted).not.toMatch(/access-secret|refresh-secret|accessToken/);
    expect(decryptConnectionData(encrypted, { tenantId: "10001", connectionId: "connection-a" })).toEqual(payload);
    expect(() => decryptConnectionData(encrypted, { tenantId: "20002", connectionId: "connection-a" })).toThrow();
    expect(() => decryptConnectionData(encrypted, { tenantId: "10001", connectionId: "connection-b" })).toThrow();
  });

  it("uses randomized authenticated encryption and refuses weak configuration", () => {
    process.env.NINEROUTER_VAULT_KEY = "test-only-key-material-that-is-long-enough";
    const first = encryptConnectionData({ apiKey: "same" }, { tenantId: "10001", connectionId: "a" });
    const second = encryptConnectionData({ apiKey: "same" }, { tenantId: "10001", connectionId: "a" });
    expect(first).not.toBe(second);
    delete process.env.NINEROUTER_VAULT_KEY;
    process.env.ROUTER_SECRET = "short";
    expect(() => encryptConnectionData({}, { tenantId: "10001", connectionId: "a" }))
      .toThrow(expect.objectContaining({ code: "NINEROUTER_VAULT_KEY_INVALID" }));
  });

  it("fails closed without tenant or connection context", () => {
    process.env.NINEROUTER_VAULT_KEY = "test-only-key-material-that-is-long-enough";
    expect(() => encryptConnectionData({ apiKey: "fake-test-value" }, { tenantId: "", connectionId: "a" }))
      .toThrow(expect.objectContaining({ code: "NINEROUTER_VAULT_CONTEXT_INVALID" }));
    expect(() => encryptConnectionData({ apiKey: "fake-test-value" }, { tenantId: "10001", connectionId: "" }))
      .toThrow(expect.objectContaining({ code: "NINEROUTER_VAULT_CONTEXT_INVALID" }));
  });

  it("accepts ROUTER_SECRET fallback only at the project HMAC length", () => {
    process.env.ROUTER_SECRET = "r".repeat(63);
    expect(() => encryptConnectionData({}, { tenantId: "10001", connectionId: "a" }))
      .toThrow(expect.objectContaining({ code: "NINEROUTER_VAULT_KEY_INVALID" }));
    process.env.ROUTER_SECRET = "r".repeat(64);
    expect(isEncryptedConnectionData(encryptConnectionData({}, { tenantId: "10001", connectionId: "a" }))).toBe(true);
  });
});
