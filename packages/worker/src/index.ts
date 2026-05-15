import { startCrawlWorker } from "./crawl";
import { startAuditWorker } from "./audit";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://bulk:bulk@localhost:5432/bulk_analyzer";

const crawlWorker = startCrawlWorker(databaseUrl);
const auditWorker = startAuditWorker(databaseUrl);

console.log("[worker] Crawl + Audit workers started");

process.on("SIGTERM", async () => {
  await crawlWorker.close();
  await auditWorker.close();
  process.exit(0);
});
