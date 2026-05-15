import Fastify from "fastify";
import cors from "@fastify/cors";
import { jobRoutes } from "./routes/jobs";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jobRoutes);

app.get("/health", async () => ({ ok: true }));

const port = parseInt(process.env.PORT ?? "4000", 10);
await app.listen({ port, host: "0.0.0.0" });
