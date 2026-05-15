import { Worker } from "bullmq";
import { createDb, jobs, urlResults } from "@bulk/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditQueue, redisConnection } from "./queue";

async function fetchSitemapUrls(siteUrl: string): Promise<string[]> {
  const sitemapUrls = [
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/sitemap_index.xml`,
    `${siteUrl}/sitemap/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      const urls = extractUrlsFromSitemap(text, siteUrl);
      if (urls.length > 0) return urls;
    } catch {
      continue;
    }
  }
  return [];
}

function extractUrlsFromSitemap(xml: string, siteUrl: string): string[] {
  const urls: string[] = [];

  // sitemap index — recurse into child sitemaps
  const sitemapMatches = xml.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi);
  for (const match of sitemapMatches) {
    urls.push(match[1].trim());
  }
  if (urls.length > 0) {
    return urls; // caller will need to fetch these recursively, for now return as-is
  }

  // regular sitemap
  const locMatches = xml.matchAll(/<loc>(.*?)<\/loc>/gi);
  for (const match of locMatches) {
    const url = match[1].trim();
    if (url.startsWith(siteUrl)) {
      urls.push(url);
    }
  }
  return urls;
}

async function resolveAllUrls(siteUrl: string): Promise<string[]> {
  const initial = await fetchSitemapUrls(siteUrl);
  if (initial.length === 0) return [siteUrl];

  // if sitemap index, fetch child sitemaps
  const allUrls: string[] = [];
  for (const url of initial) {
    if (url.endsWith(".xml")) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const text = await res.text();
        const childUrls = extractUrlsFromSitemap(text, siteUrl);
        allUrls.push(...childUrls);
      } catch {
        continue;
      }
    } else {
      allUrls.push(url);
    }
  }
  return allUrls.length > 0 ? allUrls : initial;
}

export function startCrawlWorker(databaseUrl: string) {
  const db = createDb(databaseUrl);

  return new Worker(
    "crawl",
    async (job) => {
      const { jobId, siteUrl } = job.data as { jobId: string; siteUrl: string };

      await db.update(jobs).set({ status: "crawling" }).where(eq(jobs.id, jobId));

      const urls = await resolveAllUrls(siteUrl);
      const unique = [...new Set(urls)].slice(0, 5000); // hard cap

      await db.update(jobs).set({ totalUrls: unique.length, status: "auditing" }).where(eq(jobs.id, jobId));

      const rows = unique.map((url) => ({ id: nanoid(), jobId, url, status: "queued" }));
      // insert in batches
      for (let i = 0; i < rows.length; i += 100) {
        await db.insert(urlResults).values(rows.slice(i, i + 100));
      }

      const auditJobs = unique.map((url, idx) => ({
        name: "audit",
        data: { jobId, url, resultId: rows[idx].id },
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }));

      for (let i = 0; i < auditJobs.length; i += 100) {
        await auditQueue.addBulk(auditJobs.slice(i, i + 100));
      }

      console.log(`[crawl] Job ${jobId}: queued ${unique.length} URLs`);
    },
    { connection: redisConnection, concurrency: 2 }
  );
}
