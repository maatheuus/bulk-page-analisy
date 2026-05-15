import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { createDb, jobs, urlResults, logs, aiReports } from "@bulk/db";
import { eq, desc, count, and, sql, avg, like } from "drizzle-orm";
import { crawlQueue, auditQueue } from "../queue";

export async function jobRoutes(app: FastifyInstance) {
  const db = createDb(process.env.DATABASE_URL!);

  app.post("/jobs", async (req, reply) => {
    const { siteUrl, formFactor } = req.body as { siteUrl: string; formFactor?: string };

    if (!siteUrl) {
      return reply.status(400).send({ error: "siteUrl is required" });
    }

    let url: URL;
    try {
      url = new URL(siteUrl);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }

    const factor = formFactor === "mobile" ? "mobile" : "desktop";
    const id = nanoid();
    await db.insert(jobs).values({ id, siteUrl: url.origin, status: "pending", formFactor: factor });
    await crawlQueue.add("crawl", { jobId: id, siteUrl: url.origin, formFactor: factor });

    return reply.status(201).send({ id, siteUrl: url.origin, status: "pending" });
  });

  app.get<{ Querystring: { site?: string } }>("/jobs", async (req, reply) => {
    const { site } = req.query;
    const list = await db
      .select()
      .from(jobs)
      .where(site ? like(jobs.siteUrl, `%${site}%`) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(50);
    return reply.send(list);
  });

  app.get<{ Querystring: { a: string; b: string } }>("/jobs/compare", async (req, reply) => {
    const { a, b } = req.query;
    if (!a || !b) return reply.status(400).send({ error: "Params a and b required" });

    async function getJobStats(jobId: string) {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!job) return null;
      const [stats] = await db
        .select({
          avgLcp: avg(urlResults.lcp),
          avgCls: avg(urlResults.cls),
          avgInp: avg(urlResults.inp),
          avgTtfb: avg(urlResults.ttfb),
          avgPerf: avg(urlResults.perfScore),
          avgSeo: avg(urlResults.seoScore),
          avgA11y: avg(urlResults.a11yScore),
        })
        .from(urlResults)
        .where(and(eq(urlResults.jobId, jobId), eq(urlResults.status, "done")));
      return { job, stats };
    }

    const [dataA, dataB] = await Promise.all([getJobStats(a), getJobStats(b)]);
    if (!dataA || !dataB) return reply.status(404).send({ error: "One or both jobs not found" });

    return reply.send({ a: dataA, b: dataB });
  });

  app.get("/logs", async (_req, reply) => {
    const list = await db
      .select()
      .from(logs)
      .orderBy(desc(logs.createdAt))
      .limit(100);
    return reply.send(list);
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
    if (!job) return reply.status(404).send({ error: "Not found" });
    return reply.send(job);
  });

  app.get<{ Params: { id: string }; Querystring: { page?: string; sort?: string; order?: string } }>(
    "/jobs/:id/results",
    async (req, reply) => {
      const page = parseInt(req.query.page ?? "1", 10);
      const pageSize = 50;
      const offset = (page - 1) * pageSize;

      const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
      if (!job) return reply.status(404).send({ error: "Not found" });

      const results = await db
        .select()
        .from(urlResults)
        .where(eq(urlResults.jobId, req.params.id))
        .limit(pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(urlResults)
        .where(eq(urlResults.jobId, req.params.id));

      return reply.send({ results, total, page, pageSize });
    }
  );

  app.get<{ Params: { id: string } }>("/jobs/:id/export", async (req, reply) => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
    if (!job) return reply.status(404).send({ error: "Not found" });

    const results = await db
      .select()
      .from(urlResults)
      .where(eq(urlResults.jobId, req.params.id));

    const header = "url,status,lcp,cls,inp,ttfb,perf_score,seo_score,a11y_score,error\n";
    const rows = results
      .map((r) =>
        [r.url, r.status, r.lcp, r.cls, r.inp, r.ttfb, r.perfScore, r.seoScore, r.a11yScore, r.error ?? ""]
          .map((v) => (v == null ? "" : String(v)))
          .join(",")
      )
      .join("\n");

    reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="job-${req.params.id}.csv"`)
      .send(header + rows);
  });

  app.get<{ Params: { id: string } }>("/jobs/:id/logs", async (req, reply) => {
    const list = await db
      .select()
      .from(logs)
      .where(eq(logs.jobId, req.params.id))
      .orderBy(desc(logs.createdAt))
      .limit(100);
    return reply.send(list);
  });

  app.get<{ Params: { id: string; resultId: string } }>(
    "/jobs/:id/results/:resultId",
    async (req, reply) => {
      const { id, resultId } = req.params;
      const [result] = await db
        .select()
        .from(urlResults)
        .where(and(eq(urlResults.id, resultId), eq(urlResults.jobId, id)));
      if (!result) return reply.status(404).send({ error: "Not found" });
      return reply.send(result);
    }
  );

  async function validateLinks(text: string): Promise<string> {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const found: Array<{ full: string; label: string; url: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(text)) !== null) {
      found.push({ full: m[0], label: m[1], url: m[2] });
    }
    if (found.length === 0) return text;

    async function checkLink(item: { full: string; label: string; url: string }) {
      try {
        const res = await fetch(item.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BulkAnalyzer/1.0)" },
          redirect: "follow",
        });
        return { ...item, ok: res.ok || res.status === 405 || res.status === 403 };
      } catch {
        return { ...item, ok: false };
      }
    }

    const BATCH = 5;
    const checked: Array<{ full: string; label: string; ok: boolean }> = [];
    for (let i = 0; i < found.length; i += BATCH) {
      const batch = await Promise.all(found.slice(i, i + BATCH).map(checkLink));
      checked.push(...batch);
    }

    let out = text;
    for (const { full, label, ok } of checked) {
      if (!ok) out = out.replaceAll(full, `**${label}**`);
    }
    return out;
  }

  async function callGemini(
    key: string,
    prompt: string,
    opts: { temperature: number; maxOutputTokens: number }
  ): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: opts,
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text();
      throw Object.assign(new Error("AI service error"), { detail, status: res.status });
    }
    const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  const LINK_GUIDANCE = `
LINKS — CRITICAL RULES:
- Only use URLs from these exact domains: web.dev, developer.chrome.com, developers.google.com, mdn.mozilla.org
- Use ONLY these known-stable URL patterns (do not invent paths):
  • https://web.dev/articles/lcp
  • https://web.dev/articles/cls
  • https://web.dev/articles/inp
  • https://web.dev/articles/ttfb
  • https://web.dev/articles/optimize-lcp
  • https://web.dev/articles/optimize-cls
  • https://web.dev/articles/efficiently-load-third-party-javascript
  • https://web.dev/articles/render-blocking-resources
  • https://web.dev/articles/uses-optimized-images
  • https://web.dev/articles/serve-images-webp
  • https://web.dev/articles/codelab-serve-images-webp
  • https://web.dev/articles/uses-text-compression
  • https://web.dev/articles/remove-unused-css
  • https://web.dev/articles/unused-javascript
  • https://web.dev/articles/font-best-practices
  • https://web.dev/articles/lazy-loading-images
  • https://web.dev/articles/preload-critical-assets
  • https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources
  • https://developer.chrome.com/docs/lighthouse/performance/unused-css-rules
  • https://developer.chrome.com/docs/lighthouse/performance/unused-javascript
  • https://developer.chrome.com/docs/lighthouse/performance/uses-optimized-images
  • https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing
  • https://mdn.mozilla.org/en-US/docs/Web/Performance
  • https://mdn.mozilla.org/en-US/docs/Web/HTML/Element/img
- If unsure about an exact URL, use the root section: https://web.dev/explore/fast or https://mdn.mozilla.org/en-US/docs/Web/Performance
- NEVER invent article slugs. Use only URLs listed above or the section roots.`;

  app.post<{ Params: { id: string } }>("/jobs/:id/ai-report", async (req, reply) => {
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return reply.status(503).send({ error: "AI not configured" });

    const { id } = req.params;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return reply.status(404).send({ error: "Not found" });
    if (job.status !== "done") return reply.status(400).send({ error: "Job not finished" });

    const doneFilter = and(eq(urlResults.jobId, id), eq(urlResults.status, "done"));
    const [[stats], worstPages] = await Promise.all([
      db.select({
        avgLcp: avg(urlResults.lcp),
        avgCls: avg(urlResults.cls),
        avgInp: avg(urlResults.inp),
        avgTtfb: avg(urlResults.ttfb),
        avgPerf: avg(urlResults.perfScore),
        avgSeo: avg(urlResults.seoScore),
        avgA11y: avg(urlResults.a11yScore),
      }).from(urlResults).where(doneFilter),
      db.select().from(urlResults).where(doneFilter).orderBy(urlResults.perfScore).limit(10),
    ]);

    const oppCounts = new Map<string, number>();
    for (const page of worstPages) {
      if (!page.opportunities) continue;
      const ops = JSON.parse(page.opportunities) as Array<{ title: string; savingsMs: number }>;
      for (const op of ops) {
        oppCounts.set(op.title, (oppCounts.get(op.title) ?? 0) + op.savingsMs);
      }
    }
    const topOpps = [...oppCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const n = (v: string | null) => (v ? parseFloat(v).toFixed(1) : "N/A");

    const prompt = `You are a web performance expert analyzing Lighthouse audit results. Provide specific, actionable recommendations with real resource links.

SITE: ${job.siteUrl}
FORM FACTOR: ${job.formFactor}
PAGES ANALYZED: ${job.doneUrls} (${job.failedUrls} failed)

AGGREGATE METRICS (averages across all pages):
- Performance Score: ${n(stats.avgPerf)}/100
- LCP (Largest Contentful Paint): ${n(stats.avgLcp)}ms  [good: <2500ms]
- CLS (Cumulative Layout Shift): ${n(stats.avgCls)}  [good: <0.1]
- INP (Interaction to Next Paint): ${n(stats.avgInp)}ms  [good: <200ms]
- TTFB (Time to First Byte): ${n(stats.avgTtfb)}ms  [good: <800ms]
- SEO Score: ${n(stats.avgSeo)}/100
- Accessibility Score: ${n(stats.avgA11y)}/100

WORST 5 PAGES:
${worstPages.slice(0, 5).map((p, i) => `${i + 1}. ${p.url}
   Perf: ${p.perfScore ?? "N/A"} | LCP: ${p.lcp ?? "N/A"}ms | CLS: ${p.cls ?? "N/A"} | INP: ${p.inp ?? "N/A"}ms | TTFB: ${p.ttfb ?? "N/A"}ms`).join("\n")}

TOP IMPROVEMENT OPPORTUNITIES (aggregated across pages):
${topOpps.map(([title, ms]) => `- ${title} (~${Math.round(ms / 1000)}s total savings)`).join("\n") || "No specific opportunities detected"}

Respond with a structured performance report using this exact format:

## EXECUTIVE SUMMARY
[2-3 sentences describing the overall performance health and the most critical finding]

## CRITICAL ISSUES
[List 2-4 critical problems found, each with a severity label: CRITICAL / HIGH / MEDIUM]

## RECOMMENDATIONS

### [Issue name — keep it short]
**What:** [1-2 sentence explanation]
**Impact:** [How this affects users and Core Web Vitals]
**How to fix:** [3-5 specific, technical steps]
**Resources:**
- [Title](https://real-url.com)
- [Title](https://real-url.com)

[Repeat for 3-5 major recommendations total]

## QUICK WINS
[5-7 bullet points of small improvements that can be done in under a day]

${LINK_GUIDANCE}`;

    let raw: string;
    try {
      raw = await callGemini(GEMINI_KEY, prompt, { temperature: 0.4, maxOutputTokens: 8192 });
    } catch (e: any) {
      return reply.status(502).send({ error: "AI service error", detail: e.detail });
    }
    const report = await validateLinks(raw);

    const reportId = nanoid();
    await db.insert(aiReports).values({ id: reportId, jobId: id, report });

    return reply.send({ id: reportId, report, createdAt: new Date().toISOString() });
  });

  app.post<{ Params: { id: string; resultId: string } }>(
    "/jobs/:id/results/:resultId/ai-tips",
    async (req, reply) => {
      const GEMINI_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_KEY) return reply.status(503).send({ error: "AI not configured" });

      const { id, resultId } = req.params;
      const [result] = await db
        .select()
        .from(urlResults)
        .where(and(eq(urlResults.id, resultId), eq(urlResults.jobId, id)));

      if (!result || result.status !== "done") {
        return reply.status(404).send({ error: "Result not found or not done" });
      }

      const opportunities = result.opportunities ? (JSON.parse(result.opportunities) as Array<{ title: string; description: string; savingsMs: number }>) : [];

      const prompt = `You are a web performance expert. Analyze this single page's Lighthouse results and give specific, actionable tips.

URL: ${result.url}

METRICS:
- Performance: ${result.perfScore ?? "N/A"}/100
- LCP: ${result.lcp ?? "N/A"}ms  [good: <2500ms]
- CLS: ${result.cls ?? "N/A"}  [good: <0.1]
- INP: ${result.inp ?? "N/A"}ms  [good: <200ms]
- TTFB: ${result.ttfb ?? "N/A"}ms  [good: <800ms]
- SEO: ${result.seoScore ?? "N/A"}/100
- Accessibility: ${result.a11yScore ?? "N/A"}/100

LIGHTHOUSE OPPORTUNITIES:
${opportunities.map((o) => `- ${o.title}: ~${Math.round(o.savingsMs)}ms savings\n  ${o.description}`).join("\n") || "None detected"}

Give 4-6 specific, technical improvement tips for this page. For each tip:
- Start with a short title on its own line prefixed with "### "
- Explain the issue and fix in 2-3 sentences
- Include 1-2 real resource links

${LINK_GUIDANCE}`;

      let raw: string;
      try {
        raw = await callGemini(GEMINI_KEY, prompt, { temperature: 0.3, maxOutputTokens: 4096 });
      } catch {
        return reply.status(502).send({ error: "AI service error" });
      }
      const tips = await validateLinks(raw);
      return reply.send({ tips });
    }
  );

  app.get<{ Params: { id: string } }>("/jobs/:id/ai-reports", async (req, reply) => {
    const list = await db
      .select({ id: aiReports.id, createdAt: aiReports.createdAt })
      .from(aiReports)
      .where(eq(aiReports.jobId, req.params.id))
      .orderBy(desc(aiReports.createdAt));
    return reply.send(list);
  });

  app.get<{ Params: { id: string; reportId: string } }>(
    "/jobs/:id/ai-reports/:reportId",
    async (req, reply) => {
      const [r] = await db
        .select()
        .from(aiReports)
        .where(and(eq(aiReports.id, req.params.reportId), eq(aiReports.jobId, req.params.id)));
      if (!r) return reply.status(404).send({ error: "Not found" });
      return reply.send(r);
    }
  );

  app.post<{ Params: { id: string } }>("/jobs/:id/cancel", async (req, reply) => {
    const { id } = req.params;

    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return reply.status(404).send({ error: "Not found" });

    const activeStatuses = ["pending", "crawling", "auditing"];
    if (!activeStatuses.includes(job.status)) {
      return reply.status(400).send({ error: "Job is not active" });
    }

    await db
      .update(jobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(eq(jobs.id, id));

    await db
      .update(urlResults)
      .set({ status: "error", error: "Cancelled" })
      .where(and(eq(urlResults.jobId, id), sql`${urlResults.status} IN ('queued', 'running')`));

    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string; resultId: string } }>(
    "/jobs/:id/results/:resultId/retry",
    async (req, reply) => {
      const { id, resultId } = req.params;

      const [result] = await db
        .select()
        .from(urlResults)
        .where(and(eq(urlResults.id, resultId), eq(urlResults.jobId, id)));

      if (!result) return reply.status(404).send({ error: "Result not found" });

      if (result.status === "done") {
        return reply.status(400).send({ error: "Already done" });
      }

      if (result.status === "error") {
        await db
          .update(jobs)
          .set({ failedUrls: sql`${jobs.failedUrls} - 1` })
          .where(eq(jobs.id, id));
      }

      await db
        .update(urlResults)
        .set({ status: "queued", error: null })
        .where(eq(urlResults.id, resultId));

      await auditQueue.add("audit", { jobId: id, url: result.url, resultId });

      return reply.send({ ok: true });
    }
  );

  app.get<{ Params: { id: string } }>("/jobs/:id/stream", async (req, reply) => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
    if (!job) return reply.status(404).send({ error: "Not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(async () => {
      const [current] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
      if (!current) {
        clearInterval(interval);
        reply.raw.end();
        return;
      }
      send(current);
      if (current.status === "done" || current.status === "failed") {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1500);

    req.raw.on("close", () => clearInterval(interval));
  });
}
