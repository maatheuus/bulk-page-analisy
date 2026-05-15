"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Job } from "@/types";
import { statusColor, fetchWithRetry } from "@/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function statusLabel(s: string) {
  return s.toUpperCase();
}

function pct(job: Job) {
  if (!job.totalUrls) return 0;
  return Math.round(((job.doneUrls + job.failedUrls) / job.totalUrls) * 100);
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetchJobs();
    const t = setInterval(fetchJobs, 4000);
    return () => clearInterval(t);
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetchWithRetry(`${API}/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError("URL must start with http:// or https://");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithRetry(`${API}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: url.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create job");
        setSubmitting(false);
        return;
      }
      const job = await res.json();
      router.push(`/jobs/${job.id}`);
    } catch {
      setError("Could not connect to API");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-15 px-6 pb-20 relative z-[1]">
      {/* Logo / Header */}
      <div className="text-center mb-14">
        <div className="font-['Orbitron'] text-[clamp(2rem,6vw,3.5rem)] font-black text-[var(--lime)] tracking-widest leading-none shadow-[0_0_30px_rgba(57,255,90,0.5),0_0_60px_rgba(57,255,90,0.2)]">
          BULK ANALYZER
        </div>
        <div className="mt-2.5 text-[var(--text-dim)] text-[0.75rem] tracking-[0.25em] uppercase">
          Web Performance Intelligence System
          <span className="blink ml-1.5">▮</span>
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[640px] mb-4"
      >
        <div className="neon-border flex items-center bg-[var(--bg-panel)] pl-4">
          <span className="text-[var(--lime-dim)] text-[0.8rem] mr-2.5 shrink-0">
            TARGET://
          </span>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-transparent border-none outline-none text-[var(--text)] font-['Share_Tech_Mono'] text-[0.95rem] py-3.5 caret-[var(--lime)]"
          />
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="bg-[var(--lime)] disabled:bg-[var(--lime-dim)] text-[#060a08] border-none px-6 py-3.5 font-['Orbitron'] font-bold text-[0.7rem] tracking-widest cursor-pointer disabled:cursor-not-allowed shrink-0 transition-colors h-full self-stretch flex items-center gap-2"
          >
            {submitting ? "SCANNING..." : "INITIATE SCAN"}
            {!submitting && (
              <span className="text-[0.8rem]">▶</span>
            )}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-[var(--red)] text-[0.78rem] pl-1">
            ⚠ {error}
          </div>
        )}
      </form>

      <div className="text-[var(--text-muted)] text-[0.72rem] mb-16 tracking-widest">
        Supports sitemap.xml auto-discovery · Up to 5,000 pages per scan
      </div>

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <div className="w-full max-w-[800px]">
          <div className="flex items-center gap-3 mb-4 text-[var(--text-dim)] text-[0.7rem] tracking-widest uppercase">
            <span>Recent Scans</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
            <Link href="/debug" className="hover:text-[var(--lime)] transition-colors">Debug Logs</Link>
          </div>

          <div className="flex flex-col gap-0.5">
            {jobs.map((job, i) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="no-underline"
              >
                <div
                  className="animate-fade-up bg-[var(--bg-panel)] border border-[var(--border)] p-3 px-4 flex items-center gap-4 cursor-pointer transition-all opacity-0 hover:border-[var(--lime-dim)] hover:bg-[var(--bg-hover)]"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: `var(--${statusColor(job.status)})`,
                      boxShadow: job.status !== "done" && job.status !== "failed"
                        ? `0 0 8px var(--${statusColor(job.status)})`
                        : "none",
                      animation: job.status === "auditing" || job.status === "crawling"
                        ? "pulse-dot 1.5s ease-in-out infinite"
                        : "none",
                    }}
                  />

                  <div className="flex-1 overflow-hidden">
                    <div className="text-[0.88rem] text-[var(--text)] overflow-hidden text-ellipsis whitespace-nowrap">
                      {job.siteUrl}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 text-[0.78rem]">
                    {job.totalUrls > 0 && (
                      <span className="text-[var(--text-dim)]">
                        {(job.doneUrls + job.failedUrls).toLocaleString()}/{job.totalUrls.toLocaleString()} pages
                      </span>
                    )}
                    <span
                      className="tracking-widest text-[0.68rem]"
                      style={{ color: `var(--${statusColor(job.status)})` }}
                    >
                      {statusLabel(job.status)}
                      {job.status === "auditing" && ` ${pct(job)}%`}
                    </span>
                  </div>

                  <span className="text-[var(--text-muted)] text-[0.7rem]">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
