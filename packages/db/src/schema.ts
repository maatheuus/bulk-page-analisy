import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  siteUrl: text("site_url").notNull(),
  status: text("status").notNull().default("pending"),
  formFactor: text("form_factor").notNull().default("desktop"),
  totalUrls: integer("total_urls").default(0),
  doneUrls: integer("done_urls").default(0),
  failedUrls: integer("failed_urls").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const urlResults = pgTable("url_results", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: text("status").notNull().default("queued"),
  formFactor: text("form_factor"),
  lcp: real("lcp"),
  cls: real("cls"),
  inp: real("inp"),
  ttfb: real("ttfb"),
  perfScore: integer("perf_score"),
  seoScore: integer("seo_score"),
  a11yScore: integer("a11y_score"),
  error: text("error"),
  analyzedAt: timestamp("analyzed_at"),
  opportunities: text("opportunities"),
});

export const aiReports = pgTable("ai_reports", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  report: text("report").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const logs = pgTable("logs", {
  id: text("id").primaryKey(),
  jobId: text("job_id"),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type UrlResult = typeof urlResults.$inferSelect;
export type NewUrlResult = typeof urlResults.$inferInsert;
