import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreClass, fmt, fmtMs, statusColor, fetchWithRetry } from "./utils";

describe("scoreClass", () => {
  it("returns empty string for null", () => {
    expect(scoreClass(null, "perf")).toBe("");
    expect(scoreClass(null, "ms")).toBe("");
    expect(scoreClass(null, "cls")).toBe("");
  });

  describe("perf", () => {
    it("good at 90", () => expect(scoreClass(90, "perf")).toBe("text-(--lime)"));
    it("good above 90", () => expect(scoreClass(100, "perf")).toBe("text-(--lime)"));
    it("mid at 50", () => expect(scoreClass(50, "perf")).toBe("text-(--amber)"));
    it("mid at 89", () => expect(scoreClass(89, "perf")).toBe("text-(--amber)"));
    it("bad at 49", () => expect(scoreClass(49, "perf")).toBe("text-(--red)"));
    it("bad at 0", () => expect(scoreClass(0, "perf")).toBe("text-(--red)"));
  });

  describe("ms", () => {
    it("good at 1500", () => expect(scoreClass(1500, "ms")).toBe("text-(--lime)"));
    it("good below 1500", () => expect(scoreClass(800, "ms")).toBe("text-(--lime)"));
    it("mid at 3500", () => expect(scoreClass(3500, "ms")).toBe("text-(--amber)"));
    it("mid between thresholds", () => expect(scoreClass(2000, "ms")).toBe("text-(--amber)"));
    it("bad above 3500", () => expect(scoreClass(3501, "ms")).toBe("text-(--red)"));
  });

  describe("cls", () => {
    it("good at 0.1", () => expect(scoreClass(0.1, "cls")).toBe("text-(--lime)"));
    it("good at 0", () => expect(scoreClass(0, "cls")).toBe("text-(--lime)"));
    it("mid at 0.25", () => expect(scoreClass(0.25, "cls")).toBe("text-(--amber)"));
    it("mid between thresholds", () => expect(scoreClass(0.15, "cls")).toBe("text-(--amber)"));
    it("bad above 0.25", () => expect(scoreClass(0.26, "cls")).toBe("text-(--red)"));
  });
});

describe("fmt", () => {
  it("returns em dash for null", () => expect(fmt(null, "ms")).toBe("—"));
  it("appends unit", () => expect(fmt(100, "ms")).toBe("100ms"));
  it("appends empty unit", () => expect(fmt(42, "")).toBe("42"));
  it("rounds to 0 decimals by default", () => expect(fmt(1.7, "x")).toBe("2x"));
  it("respects decimals param", () => expect(fmt(1.234, "", 2)).toBe("1.23"));
  it("zero value", () => expect(fmt(0, "s")).toBe("0s"));
});

describe("fmtMs", () => {
  it("returns em dash for null", () => expect(fmtMs(null)).toBe("—"));
  it("formats ms under 1000", () => expect(fmtMs(500)).toBe("500ms"));
  it("formats ms at 999", () => expect(fmtMs(999)).toBe("999ms"));
  it("converts to seconds at 1000", () => expect(fmtMs(1000)).toBe("1.0s"));
  it("converts 2500ms to 2.5s", () => expect(fmtMs(2500)).toBe("2.5s"));
  it("formats 0ms", () => expect(fmtMs(0)).toBe("0ms"));
});

describe("statusColor", () => {
  it("done → lime", () => expect(statusColor("done")).toBe("lime"));
  it("failed → red", () => expect(statusColor("failed")).toBe("red"));
  it("error → red", () => expect(statusColor("error")).toBe("red"));
  it("cancelled → amber", () => expect(statusColor("cancelled")).toBe("amber"));
  it("pending → amber", () => expect(statusColor("pending")).toBe("amber"));
  it("unknown status → amber", () => expect(statusColor("auditing")).toBe("amber"));
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns successful response without retry", async () => {
    const mockRes = new Response(null, { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(mockRes));
    const result = await fetchWithRetry("http://test.com");
    expect(result).toBe(mockRes);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and succeeds", async () => {
    const fail = new Response(null, { status: 500 });
    const ok = new Response(null, { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok));
    const result = await fetchWithRetry("http://test.com", undefined, 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it("does not retry on 401", async () => {
    const authFail = new Response(null, { status: 401 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(authFail));
    const result = await fetchWithRetry("http://test.com", undefined, 2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(401);
  });

  it("retries on network error", async () => {
    const ok = new Response(null, { status: 200 });
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(ok)
    );
    const result = await fetchWithRetry("http://test.com", undefined, 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it("throws after exhausting retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchWithRetry("http://test.com", undefined, 1)).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("adds auth header when token in localStorage", async () => {
    localStorage.setItem("auth_token", "tok-123");
    const ok = new Response(null, { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok));
    await fetchWithRetry("http://test.com");
    expect(fetch).toHaveBeenCalledWith("http://test.com", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
    }));
  });

  it("does not add auth header when no token", async () => {
    const ok = new Response(null, { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok));
    await fetchWithRetry("http://test.com");
    const calledHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers ?? {};
    expect(calledHeaders).not.toHaveProperty("Authorization");
  });
});
