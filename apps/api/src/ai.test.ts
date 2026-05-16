import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateLinks, callGemini } from "./ai";

describe("validateLinks", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns text unchanged when no links present", async () => {
    const input = "No links here, just plain text.";
    const result = await validateLinks(input);
    expect(result).toBe(input);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps valid links (200 response)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const input = "Check [web.dev](https://web.dev/articles/lcp) for details.";
    const result = await validateLinks(input);
    expect(result).toBe(input);
  });

  it("replaces broken links (404) with bold text", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const input = "Check [Broken Link](https://example.com/not-found) here.";
    const result = await validateLinks(input);
    expect(result).toBe("Check **Broken Link** here.");
    expect(result).not.toContain("https://example.com/not-found");
  });

  it("replaces all occurrences of the same broken link", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const link = "[Docs](https://example.com/404)";
    const input = `${link} and again ${link}`;
    const result = await validateLinks(input);
    expect(result).toBe("**Docs** and again **Docs**");
  });

  it("keeps links returning 403 (auth-protected, likely exists)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    const input = "[Protected](https://example.com/protected)";
    const result = await validateLinks(input);
    expect(result).toBe(input);
  });

  it("keeps links returning 405 (HEAD not allowed, URL exists)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 405 }));
    const input = "[Resource](https://example.com/resource)";
    const result = await validateLinks(input);
    expect(result).toBe(input);
  });

  it("replaces link when fetch throws (network error)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    const input = "[Unreachable](https://192.0.2.1/page)";
    const result = await validateLinks(input);
    expect(result).toBe("**Unreachable**");
  });

  it("handles multiple links, mixed valid and broken", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const input = "[Good](https://web.dev/articles/lcp) and [Bad](https://example.com/404)";
    const result = await validateLinks(input);
    expect(result).toContain("[Good](https://web.dev/articles/lcp)");
    expect(result).toContain("**Bad**");
    expect(result).not.toContain("[Bad]");
  });

  it("batches requests (no more than 5 at once per batch)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const links = Array.from({ length: 7 }, (_, i) =>
      `[Link${i}](https://example.com/page${i})`
    ).join(" ");
    await validateLinks(links);
    expect(fetch).toHaveBeenCalledTimes(7);
  });
});

describe("callGemini", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns text from candidates response", async () => {
    const mockBody = {
      candidates: [{ content: { parts: [{ text: "Hello world" }] } }],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockBody), { status: 200 })
    );
    const result = await callGemini("test-key", "prompt", { temperature: 0.4, maxOutputTokens: 100 });
    expect(result).toBe("Hello world");
  });

  it("sends correct model URL and payload", async () => {
    const mockBody = { candidates: [{ content: { parts: [{ text: "ok" }] } }] };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockBody), { status: 200 })
    );
    await callGemini("my-key", "test prompt", { temperature: 0.3, maxOutputTokens: 512 });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("gemini-2.5-flash");
    expect(url).toContain("key=my-key");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe("test prompt");
    expect(body.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 512 });
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Rate limit exceeded", { status: 429 })
    );
    await expect(callGemini("key", "prompt", { temperature: 0.4, maxOutputTokens: 100 }))
      .rejects.toThrow("AI service error");
  });

  it("returns empty string when candidates are absent", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const result = await callGemini("key", "prompt", { temperature: 0.4, maxOutputTokens: 100 });
    expect(result).toBe("");
  });
});
