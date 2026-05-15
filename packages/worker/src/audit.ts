import { Worker } from "bullmq";
import { createDb, jobs, urlResults } from "@bulk/db";
import { eq, sql } from "drizzle-orm";
import puppeteer from "puppeteer";
import { redisConnection } from "./queue";

const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

async function runLighthouse(url: string) {
  const { default: lighthouse } = await import("lighthouse");

  const browser = await puppeteer.launch({
    headless: true,
    args: CHROME_FLAGS,
  });

  try {
    const port = new URL(browser.wsEndpoint()).port;

    const result = await lighthouse(url, {
      port: parseInt(port, 10),
      output: "json",
      logLevel: "silent",
      onlyCategories: ["performance", "seo", "accessibility"],
      formFactor: "desktop",
      screenEmulation: { disabled: true },
    });

    if (!result?.lhr) throw new Error("No Lighthouse result");

    const { lhr } = result;
    const audits = lhr.audits;

    return {
      lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      inp: audits["interaction-to-next-paint"]?.numericValue ?? null,
      ttfb: audits["server-response-time"]?.numericValue ?? null,
      perfScore: Math.round((lhr.categories.performance?.score ?? 0) * 100),
      seoScore: Math.round((lhr.categories.seo?.score ?? 0) * 100),
      a11yScore: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
    };
  } finally {
    await browser.close();
  }
}

export function startAuditWorker(databaseUrl: string) {
  const db = createDb(databaseUrl);
  const concurrency = parseInt(process.env.AUDIT_CONCURRENCY ?? "5", 10);

  return new Worker(
    "audit",
    async (job) => {
      const { jobId, url, resultId } = job.data as {
        jobId: string;
        url: string;
        resultId: string;
      };

      await db
        .update(urlResults)
        .set({ status: "running" })
        .where(eq(urlResults.id, resultId));

      try {
        const metrics = await runLighthouse(url);

        await db
          .update(urlResults)
          .set({ ...metrics, status: "done", analyzedAt: new Date() })
          .where(eq(urlResults.id, resultId));

        await db
          .update(jobs)
          .set({ doneUrls: sql`${jobs.doneUrls} + 1` })
          .where(eq(jobs.id, jobId));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);

        await db
          .update(urlResults)
          .set({ status: "error", error })
          .where(eq(urlResults.id, resultId));

        await db
          .update(jobs)
          .set({ failedUrls: sql`${jobs.failedUrls} + 1` })
          .where(eq(jobs.id, jobId));

        throw err;
      } finally {
        const [current] = await db.select().from(jobs).where(eq(jobs.id, jobId));
        if (
          current &&
          (current.doneUrls ?? 0) + (current.failedUrls ?? 0) >= (current.totalUrls ?? 0) &&
          current.status === "auditing"
        ) {
          await db
            .update(jobs)
            .set({ status: "done", finishedAt: new Date() })
            .where(eq(jobs.id, jobId));
        }
      }
    },
    { connection: redisConnection, concurrency }
  );
}
