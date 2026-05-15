ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "form_factor" text NOT NULL DEFAULT 'desktop';
ALTER TABLE "url_results" ADD COLUMN IF NOT EXISTS "form_factor" text;
ALTER TABLE "url_results" ADD COLUMN IF NOT EXISTS "opportunities" text;
