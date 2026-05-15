"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Job = {
  id: string;
  siteUrl: string;
  status: string;
  totalUrls: number;
  doneUrls: number;
  failedUrls: number;
  createdAt: string;
};

function statusColor(s: string) {
  if (s === "done") return "var(--lime)";
  if (s === "failed") return "var(--red)";
  return "var(--amber)";
}

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
      const res = await fetch(`${API}/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API}/jobs`, {
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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "60px 24px 80px",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Logo / Header */}
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div
          style={{
            fontFamily: "Orbitron, monospace",
            fontSize: "clamp(2rem, 6vw, 3.5rem)",
            fontWeight: 900,
            color: "var(--lime)",
            letterSpacing: "0.12em",
            textShadow: "0 0 30px rgba(57,255,90,0.5), 0 0 60px rgba(57,255,90,0.2)",
            lineHeight: 1,
          }}
        >
          BULK ANALYZER
        </div>
        <div
          style={{
            marginTop: 10,
            color: "var(--text-dim)",
            fontSize: "0.75rem",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
          }}
        >
          Web Performance Intelligence System
          <span className="blink" style={{ marginLeft: 6 }}>
            ▮
          </span>
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: 640, marginBottom: 16 }}
      >
        <div
          className="neon-border"
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg-panel)",
            padding: "0 0 0 16px",
          }}
        >
          <span style={{ color: "var(--lime-dim)", fontSize: "0.8rem", marginRight: 10, flexShrink: 0 }}>
            TARGET://
          </span>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontFamily: "Share Tech Mono, monospace",
              fontSize: "0.95rem",
              padding: "14px 0",
              caretColor: "var(--lime)",
            }}
          />
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            style={{
              background: submitting ? "var(--lime-dim)" : "var(--lime)",
              color: "#060a08",
              border: "none",
              padding: "14px 24px",
              fontFamily: "Orbitron, monospace",
              fontWeight: 700,
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              cursor: submitting ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background 0.2s",
              height: "100%",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {submitting ? "SCANNING..." : "INITIATE SCAN"}
            {!submitting && (
              <span style={{ fontSize: "0.8rem" }}>▶</span>
            )}
          </button>
        </div>
        {error && (
          <div
            style={{
              marginTop: 8,
              color: "var(--red)",
              fontSize: "0.78rem",
              paddingLeft: 4,
            }}
          >
            ⚠ {error}
          </div>
        )}
      </form>

      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "0.72rem",
          marginBottom: 64,
          letterSpacing: "0.1em",
        }}
      >
        Supports sitemap.xml auto-discovery · Up to 5,000 pages per scan
      </div>

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <div style={{ width: "100%", maxWidth: 800 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              color: "var(--text-dim)",
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            <span>Recent Scans</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {jobs.map((job, i) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="animate-fade-up"
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                    animationDelay: `${i * 40}ms`,
                    opacity: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--lime-dim)";
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-panel)";
                  }}
                >
                  {/* Status dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: statusColor(job.status),
                      flexShrink: 0,
                      boxShadow: job.status !== "done" && job.status !== "failed"
                        ? `0 0 8px ${statusColor(job.status)}`
                        : "none",
                      animation: job.status === "auditing" || job.status === "crawling"
                        ? "pulse-dot 1.5s ease-in-out infinite"
                        : "none",
                    }}
                  />

                  {/* URL */}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: "0.88rem",
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.siteUrl}
                    </div>
                  </div>

                  {/* Stats */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 24,
                      flexShrink: 0,
                      fontSize: "0.78rem",
                    }}
                  >
                    {job.totalUrls > 0 && (
                      <span style={{ color: "var(--text-dim)" }}>
                        {(job.doneUrls + job.failedUrls).toLocaleString()}/{job.totalUrls.toLocaleString()} pages
                      </span>
                    )}
                    <span
                      style={{
                        color: statusColor(job.status),
                        letterSpacing: "0.1em",
                        fontSize: "0.68rem",
                      }}
                    >
                      {statusLabel(job.status)}
                      {job.status === "auditing" && ` ${pct(job)}%`}
                    </span>
                  </div>

                  <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
