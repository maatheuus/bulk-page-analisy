import { Worker } from "bullmq";
import { createDb, jobs, urlResults, logs } from "@bulk/db";
import { eq, sql } from "drizzle-orm";
import puppeteer, { type Browser } from "puppeteer";
import { nanoid } from "nanoid";
import { redisConnection } from "./queue";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

const LIGHTHOUSE_TIMEOUT_MS = 90_000;

// ─── Domain rate limiter ──────────────────────────────────────────────────────

const domainConcurrency = new Map<string, number>();
const DOMAIN_RATE_LIMIT = parseInt(process.env.DOMAIN_RATE_LIMIT ?? "2", 10);

async function acquireDomainSlot(domain: string): Promise<void> {
  while ((domainConcurrency.get(domain) ?? 0) >= DOMAIN_RATE_LIMIT) {
    await new Promise((r) => setTimeout(r, 500));
  }
  domainConcurrency.set(domain, (domainConcurrency.get(domain) ?? 0) + 1);
}

function releaseDomainSlot(domain: string): void {
  const current = domainConcurrency.get(domain) ?? 1;
  if (current <= 1) domainConcurrency.delete(domain);
  else domainConcurrency.set(domain, current - 1);
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Lighthouse timed out after ${ms}ms: ${label}`)),
        ms
      )
    ),
  ]);
}

// ─── Browser pool ─────────────────────────────────────────────────────────────

class BrowserPool {
  private available: Browser[];
  private waiters: Array<(b: Browser) => void> = [];

  constructor(browsers: Browser[]) {
    this.available = [...browsers];
  }

  async acquire(): Promise<Browser> {
    if (this.available.length > 0) return this.available.pop()!;
    // Safety valve: pool size == concurrency so this should never block in normal operation
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async release(browser: Browser, opts: { crashed?: boolean } = {}): Promise<void> {
    let next = browser;
    if (opts.crashed || !browser.isConnected()) {
      try { await browser.close(); } catch { /* already dead */ }
      next = await puppeteer.launch({ headless: true, args: CHROME_FLAGS });
    }
    const waiter = this.waiters.shift();
    if (waiter) waiter(next);
    else this.available.push(next);
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.available.map((b) => b.close()));
    this.available = [];
  }
}

async function createBrowserPool(size: number): Promise<BrowserPool> {
  const browsers = await Promise.all(
    Array.from({ length: size }, () =>
      puppeteer.launch({ headless: true, args: CHROME_FLAGS })
    )
  );
  return new BrowserPool(browsers);
}

// ─── Lighthouse runner ────────────────────────────────────────────────────────

async function runLighthouse(
  browser: Browser,
  url: string,
  formFactor: "mobile" | "desktop" = "desktop"
) {
  const { default: lighthouse } = await import("lighthouse");

  const port = parseInt(new URL(browser.wsEndpoint()).port, 10);

  const screenEmulation =
    formFactor === "mobile"
      ? { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false }
      : { disabled: true };

  const result = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "silent",
    onlyCategories: ["performance", "seo", "accessibility"],
    formFactor,
    screenEmulation,
    maxWaitForLoad: 45_000,
    maxWaitForFcp: 15_000,
  });

  if (!result?.lhr) throw new Error("No Lighthouse result");

  const { lhr } = result;
  const audits = lhr.audits;

  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && (a.score ?? 1) < 1 && (a.details as any)?.overallSavingsMs)
    .sort((a, b) => ((b.details as any)?.overallSavingsMs ?? 0) - ((a.details as any)?.overallSavingsMs ?? 0))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      savingsMs: Math.round((a.details as any)?.overallSavingsMs ?? 0),
    }));

  return {
    lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    inp: audits["interaction-to-next-paint"]?.numericValue ?? null,
    ttfb: audits["server-response-time"]?.numericValue ?? null,
    perfScore: Math.round((lhr.categories.performance?.score ?? 0) * 100),
    seoScore: Math.round((lhr.categories.seo?.score ?? 0) * 100),
    a11yScore: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
    opportunities: opportunities.length > 0 ? JSON.stringify(opportunities) : null,
  };
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function startAuditWorker(databaseUrl: string) {
  const db = createDb(databaseUrl);
  const concurrency = parseInt(process.env.AUDIT_CONCURRENCY ?? "5", 10);

  let pool: BrowserPool;
  const poolReady = createBrowserPool(concurrency).then((p) => {
    pool = p;
    console.log(`[audit] Browser pool ready (${concurrency} browsers)`);
  });

  const worker = new Worker(
    "audit",
    async (job) => {
      await poolReady;

      const { jobId, url, resultId, formFactor = "desktop" } = job.data as {
        jobId: string;
        url: string;
        resultId: string;
        formFactor?: string;
      };

      await db
        .update(urlResults)
        .set({ status: "running" })
        .where(eq(urlResults.id, resultId));

      const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!currentJob || currentJob.status === "cancelled") {
        await db
          .update(urlResults)
          .set({ status: "error", error: "Cancelled" })
          .where(eq(urlResults.id, resultId));
        return;
      }

      const maxAttempts = job.opts.attempts ?? 1;
      const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
      const domain = new URL(url).hostname;
      const browser = await pool.acquire();

      await acquireDomainSlot(domain);
      try {
        await db.insert(logs).values({
          id: nanoid(),
          jobId,
          level: "info",
          message: `Starting Lighthouse audit for ${url}${job.attemptsMade > 0 ? ` (attempt ${job.attemptsMade + 1}/${maxAttempts})` : ""}`,
        });

        const metrics = await withTimeout(
          runLighthouse(browser, url, formFactor as "mobile" | "desktop"),
          LIGHTHOUSE_TIMEOUT_MS,
          url
        );

        await db
          .update(urlResults)
          .set({ ...metrics, formFactor, status: "done", analyzedAt: new Date(), error: null })
          .where(eq(urlResults.id, resultId));

        await db
          .update(jobs)
          .set({ doneUrls: sql`${jobs.doneUrls} + 1` })
          .where(eq(jobs.id, jobId));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);

        if (isLastAttempt) {
          await db.insert(logs).values({
            id: nanoid(),
            jobId,
            level: "error",
            message: `Lighthouse audit failed permanently for ${url}`,
            details: error,
          });

          await db
            .update(urlResults)
            .set({ status: "error", error })
            .where(eq(urlResults.id, resultId));

          await db
            .update(jobs)
            .set({ failedUrls: sql`${jobs.failedUrls} + 1` })
            .where(eq(jobs.id, jobId));
        } else {
          await db.insert(logs).values({
            id: nanoid(),
            jobId,
            level: "info",
            message: `Lighthouse audit failed for ${url}, retrying (attempt ${job.attemptsMade + 1}/${maxAttempts})`,
            details: error,
          });

          await db
            .update(urlResults)
            .set({ status: "queued", error: null })
            .where(eq(urlResults.id, resultId));
        }

        throw err;
      } finally {
        releaseDomainSlot(domain);
        await pool.release(browser, { crashed: !browser.isConnected() });

        if (isLastAttempt) {
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
      }
    },
    {
      connection: redisConnection,
      concurrency,
      lockDuration: 300_000,
      lockRenewTime: 30_000,
    }
  );

  worker.on("closed", () => {
    pool?.close().catch(console.error);
  });

  return worker;
}
