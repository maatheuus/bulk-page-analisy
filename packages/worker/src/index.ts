import { startCrawlWorker } from "./crawl";
import { startAuditWorker } from "./audit";

// Lighthouse has a bug where a failed trace computation leaves a dangling
// performance.mark, causing an uncaught DOMException that crashes the process.
// Catch it here so one bad audit doesn't take down the whole worker.
process.on("uncaughtException", (err) => {
  if (err instanceof DOMException) return;
  console.error("[worker] uncaughtException:", err);
  process.exit(1);
});

const databaseUrl = process.env.DATABASE_URL ?? "postgres://bulk:bulk@localhost:5432/bulk_analyzer";

const crawlWorker = startCrawlWorker(databaseUrl);
const auditWorker = startAuditWorker(databaseUrl);

console.log("[worker] Crawl + Audit workers started");

process.on("SIGTERM", async () => {
  await crawlWorker.close();
  await auditWorker.close();
  process.exit(0);
});
