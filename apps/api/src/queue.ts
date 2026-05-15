import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export const crawlQueue = new Queue("crawl", {
  connection: getRedisConnection(),
});

export const auditQueue = new Queue("audit", {
  connection: getRedisConnection(),
});
