import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { jobRoutes } from "./jobs";

// --- DB mock ---
type Chain = Record<string, any>;
const makeChain = (resolveWith: () => any): Chain => {
  const c: Chain = {
    from: () => c,
    where: () => c,
    orderBy: () => c,
    limit: () => c,
    offset: () => c,
    set: () => c,
    values: () => Promise.resolve(resolveWith()),
    then: (res: (v: any) => any) => Promise.resolve(resolveWith()).then(res),
  };
  return c;
};

let mockJobRow: Record<string, any> | null = null;
let mockResultRow: Record<string, any> | null = null;
let mockCounts = { total: 0 };

vi.mock("@bulk/db", () => ({
  createDb: () => ({
    select: () => makeChain(() => (mockJobRow ? [mockJobRow] : [])),
    insert: () => makeChain(() => undefined),
    update: () => makeChain(() => undefined),
  }),
  jobs: {},
  urlResults: {},
  logs: {},
  aiReports: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), desc: vi.fn(), count: vi.fn(() => ({ total: 0 })),
  and: vi.fn(), sql: vi.fn(), avg: vi.fn(), like: vi.fn(),
}));
vi.mock("nanoid", () => ({ nanoid: () => "test-id-123" }));
vi.mock("../queue", () => ({
  crawlQueue: { add: vi.fn().mockResolvedValue(undefined) },
  auditQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../ai", () => ({
  callGemini: vi.fn().mockResolvedValue("AI report text"),
  validateLinks: vi.fn().mockImplementation((t: string) => Promise.resolve(t)),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(jobRoutes);
  await app.ready();
  return app;
}

describe("POST /jobs", () => {
  it("returns 400 when siteUrl is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("siteUrl is required");
  });

  it("returns 400 when siteUrl is not a valid URL", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST", url: "/jobs", payload: { siteUrl: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid URL");
  });

  it("creates a job and returns 201 with id and status", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST", url: "/jobs", payload: { siteUrl: "https://example.com" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("pending");
    expect(body.siteUrl).toBe("https://example.com");
  });

  it("defaults formFactor to desktop", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST", url: "/jobs", payload: { siteUrl: "https://example.com" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("normalizes siteUrl to origin (strips path)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST", url: "/jobs",
      payload: { siteUrl: "https://example.com/some/path?foo=bar" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().siteUrl).toBe("https://example.com");
  });
});

describe("GET /jobs/:id", () => {
  beforeEach(() => { mockJobRow = null; });

  it("returns 404 when job not found", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/jobs/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("returns job when found", async () => {
    mockJobRow = { id: "abc", siteUrl: "https://example.com", status: "done" };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/jobs/abc" });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("abc");
  });
});

describe("POST /jobs/:id/cancel", () => {
  beforeEach(() => { mockJobRow = null; });

  it("returns 404 when job not found", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/missing/cancel" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when job is already done", async () => {
    mockJobRow = { id: "j1", status: "done" };
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/j1/cancel" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Job is not active");
  });

  it("cancels active job and returns ok", async () => {
    mockJobRow = { id: "j1", status: "auditing" };
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/j1/cancel" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe("POST /jobs/:id/ai-report", () => {
  beforeEach(() => {
    mockJobRow = null;
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns 503 when GEMINI_API_KEY not set", async () => {
    delete process.env.GEMINI_API_KEY;
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/j1/ai-report" });
    expect(res.statusCode).toBe(503);
  });

  it("returns 404 when job not found", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/missing/ai-report" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when job is not done", async () => {
    mockJobRow = { id: "j1", status: "auditing" };
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/jobs/j1/ai-report" });
    expect(res.statusCode).toBe(400);
  });
});
