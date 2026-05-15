CREATE TABLE IF NOT EXISTS "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"site_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_urls" integer DEFAULT 0,
	"done_urls" integer DEFAULT 0,
	"failed_urls" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "url_results" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lcp" real,
	"cls" real,
	"inp" real,
	"ttfb" real,
	"perf_score" integer,
	"seo_score" integer,
	"a11y_score" integer,
	"error" text,
	"analyzed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "url_results" ADD CONSTRAINT "url_results_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
