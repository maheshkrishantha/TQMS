import assert from "node:assert/strict";
import test from "node:test";

test("production config allows email notifications to be disabled", async () => {
  const originalEnvironment = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://tqms:build@127.0.0.1:5432/tqms?schema=public",
    JWT_SECRET: "a-production-test-secret-that-is-at-least-32-characters",
    CLIENT_ORIGIN: "https://tqms.pages.dev",
    NODE_ENV: "production",
    SMTP_HOST: "",
    SMTP_FROM: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
  });

  try {
    const { config } = await import("./config.js");
    assert.equal(config.NODE_ENV, "production");
    assert.equal(config.SMTP_HOST, undefined);
    assert.equal(config.SMTP_FROM, undefined);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  }
});
