CREATE TABLE IF NOT EXISTS "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
