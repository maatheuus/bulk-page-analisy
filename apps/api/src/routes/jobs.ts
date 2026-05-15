import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { createDb, jobs, urlResults } from "@bulk/db";
import { eq, desc, count } from "drizzle-orm";
import { crawlQueue, auditQueue } from "../queue";

export async function jobRoutes(app: FastifyInstance) {
  const db = createDb(process.env.DATABASE_URL!);

  app.post("/jobs", async (req, reply) => {
    const { siteUrl } = req.body as { siteUrl: string };

    if (!siteUrl) {
      return reply.status(400).send({ error: "siteUrl is required" });
    }

    let url: URL;
    try {
      url = new URL(siteUrl);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }

    const id = nanoid();
    await db.insert(jobs).values({ id, siteUrl: url.origin, status: "pending" });
    await crawlQueue.add("crawl", { jobId: id, siteUrl: url.origin });

    return reply.status(201).send({ id, siteUrl: url.origin, status: "pending" });
  });

  app.get("/jobs", async (_req, reply) => {
    const list = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(50);
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

  app.post<{ Params: { id: string } }>("/jobs/:id/abort", async (req, reply) => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
    if (!job) return reply.status(404).send({ error: "Not found" });
    if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      return reply.status(400).send({ error: "Job is already finished" });
    }

    await db
      .update(jobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(eq(jobs.id, req.params.id));

    // Drain pending audit jobs for this job from the queue
    const waiting = await auditQueue.getJobs(["waiting", "delayed"]);
    await Promise.all(
      waiting
        .filter((j) => j.data?.jobId === req.params.id)
        .map((j) => j.remove())
    );

    return reply.send({ ok: true });
  });

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
      if (current.status === "done" || current.status === "failed" || current.status === "cancelled") {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1500);

    req.raw.on("close", () => clearInterval(interval));
  });
}
