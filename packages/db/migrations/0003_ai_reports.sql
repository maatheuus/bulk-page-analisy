CREATE TABLE IF NOT EXISTS "ai_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "report" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
