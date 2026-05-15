import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { jobRoutes } from "./routes/jobs";

const AUTH_TOKEN = process.env.AUTH_TOKEN;

async function authHook(req: FastifyRequest, reply: FastifyReply) {
  if (!AUTH_TOKEN) return; // auth disabled if token not set
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== AUTH_TOKEN) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

(async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Apply auth to write endpoints only
  app.addHook("preHandler", async (req, reply) => {
    const writePaths = [
      { method: "POST", pattern: /^\/jobs$/ },
      { method: "POST", pattern: /^\/jobs\/[^/]+\/cancel$/ },
      { method: "POST", pattern: /^\/jobs\/[^/]+\/results\/[^/]+\/retry$/ },
    ];
    const isWrite = writePaths.some(
      ({ method, pattern }) => req.method === method && pattern.test(req.url)
    );
    if (isWrite) await authHook(req, reply);
  });

  await app.register(jobRoutes);

  app.get("/health", async () => ({ ok: true }));

  const port = parseInt(process.env.PORT ?? "4000", 10);
  await app.listen({ port, host: "0.0.0.0" });
})();
