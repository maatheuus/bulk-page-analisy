import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { createDb, jobs, urlResults, logs } from "@bulk/db";
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
