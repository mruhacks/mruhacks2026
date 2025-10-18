// getDatabaseURL.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDatabaseURL } from "@/utils/db";

const BASE_ENV = {
  POSTGRES_USER: "user",
  POSTGRES_PASSWORD: "pass",
  POSTGRES_DB: "db",
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: "5432",
};

const CONSTRUCTED = `postgres://${BASE_ENV.POSTGRES_USER}:${BASE_ENV.POSTGRES_PASSWORD}@${BASE_ENV.POSTGRES_HOST}:${BASE_ENV.POSTGRES_PORT}/${BASE_ENV.POSTGRES_DB}`;

describe("getDatabaseURL", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
    delete process.env.DATABASE_URL;
  });

  it("returns constructed URL when only partial vars are set and DATABASE_URL missing", () => {
    const url = getDatabaseURL();
    expect(url).toBe(CONSTRUCTED);
  });

  it("returns DATABASE_URL when only explicit defined", () => {
    process.env = { DATABASE_URL: "postgres://explicit/url" };
    const url = getDatabaseURL();
    expect(url).toBe("postgres://explicit/url");
  });

  it("returns constructed URL when both defined and equal", () => {
    process.env.DATABASE_URL = CONSTRUCTED;
    const url = getDatabaseURL();
    expect(url).toBe(CONSTRUCTED);
  });

  it("throws when both defined but differ", () => {
    process.env.DATABASE_URL = "postgres://different/url";
    expect(() => getDatabaseURL()).toThrow(/Conflicting database URLs/);
  });

  it("throws when neither defined", () => {
    delete process.env.POSTGRES_USER;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.POSTGRES_DB;
    delete process.env.DATABASE_URL;
    expect(() => getDatabaseURL()).toThrow(/No database configuration found/);
  });

  it("returns undefined if required variable missing during build", () => {
    delete process.env.POSTGRES_PASSWORD;
    const url = getDatabaseURL;
    expect(() => url()).toThrow(/No database configuration found/);
  });
});
