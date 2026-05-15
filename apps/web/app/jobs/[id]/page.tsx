"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Job = {
  id: string;
  siteUrl: string;
  status: string;
  totalUrls: number;
  doneUrls: number;
  failedUrls: number;
  createdAt: string;
  finishedAt?: string;
};

type UrlResult = {
  id: string;
  url: string;
  status: string;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  perfScore: number | null;
  seoScore: number | null;
  a11yScore: number | null;
  error: string | null;
};

type SortKey = "url" | "lcp" | "cls" | "inp" | "ttfb" | "perfScore" | "seoScore" | "a11yScore";

function scoreClass(v: number | null, type: "perf" | "ms" | "cls"): string {
  if (v === null) return "";
  if (type === "perf") {
    if (v >= 90) return "score-good";
    if (v >= 50) return "score-mid";
    return "score-bad";
  }
  if (type === "ms") {
    if (v <= 1500) return "score-good";
    if (v <= 3500) return "score-mid";
    return "score-bad";
  }
  if (type === "cls") {
    if (v <= 0.1) return "score-good";
    if (v <= 0.25) return "score-mid";
    return "score-bad";
  }
  return "";
}

function fmt(v: number | null, unit: string, decimals = 0): string {
  if (v === null) return "—";
  return `${v.toFixed(decimals)}${unit}`;
}

function fmtMs(v: number | null): string {
  if (v === null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

function statusColor(s: string): string {
  if (s === "done") return "var(--lime)";
  if (s === "failed" || s === "error") return "var(--red)";
  return "var(--amber)";
}

function pct(job: Job): number {
  if (!job.totalUrls) return 0;
  return Math.min(100, Math.round(((job.doneUrls + job.failedUrls) / job.totalUrls) * 100));
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<UrlResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("perfScore");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [aborting, setAborting] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  async function handleAbort() {
    if (!confirm("Abort this scan?")) return;
    setAborting(true);
    await fetch(`${API}/jobs/${id}/abort`, { method: "POST" });
    setAborting(false);
  }

  // Fetch job + results
  async function fetchResults(p = page) {
    const res = await fetch(`${API}/jobs/${id}/results?page=${p}`);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    fetch(`${API}/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        setJob(j);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetchResults(1);

    // SSE for live updates
    const es = new EventSource(`${API}/jobs/${id}/stream`);
    sseRef.current = es;
    es.onmessage = (e) => {
      const updated: Job = JSON.parse(e.data);
      setJob(updated);
      fetchResults(1);
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id]);

  // Refetch when page changes
  useEffect(() => { fetchResults(page); }, [page]);

  // Sort results locally
  const sorted = [...results].sort((a, b) => {
    const av = a[sort] ?? (order === "asc" ? Infinity : -Infinity);
    const bv = b[sort] ?? (order === "asc" ? Infinity : -Infinity);
    if (typeof av === "string") return order === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return order === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSort(key); setOrder("asc"); }
  }

  function arrow(key: SortKey) {
    if (sort !== key) return " ↕";
    return order === "asc" ? " ↑" : " ↓";
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ color: "var(--lime-dim)", letterSpacing: "0.2em", fontSize: "0.8rem" }}>
          LOADING<span className="blink">...</span>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ color: "var(--red)" }}>Job not found</div>
      </main>
    );
  }

  const percentage = pct(job);
  const isActive = job.status !== "done" && job.status !== "failed" && job.status !== "cancelled";
  const pageCount = Math.max(1, Math.ceil(total / 50));

  // Compute averages from loaded results
  const doneResults = results.filter((r) => r.status === "done");
  const avg = (key: keyof UrlResult) => {
    const vals = doneResults.map((r) => r[key]).filter((v) => v !== null) as number[];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "0 0 80px",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(6,10,8,0.95)",
          backdropFilter: "blur(4px)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{
            color: "var(--text-dim)",
            textDecoration: "none",
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← BACK
        </Link>
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--lime)",
              letterSpacing: "0.15em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {job.siteUrl}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: 2, letterSpacing: "0.1em" }}>
            SCAN ID: {job.id}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusColor(job.status),
              boxShadow: isActive ? `0 0 8px ${statusColor(job.status)}` : "none",
              animation: isActive ? "pulse-dot 1.5s ease-in-out infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: "0.7rem",
              color: statusColor(job.status),
              letterSpacing: "0.15em",
            }}
          >
            {job.status.toUpperCase()}
          </span>
        </div>
        {job.status !== "cancelled" && (
          <button
            onClick={handleAbort}
            disabled={aborting}
            style={{
              background: "transparent",
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "6px 14px",
              fontFamily: "Share Tech Mono, monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              cursor: aborting ? "not-allowed" : "pointer",
              opacity: aborting ? 0.5 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!aborting) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,59,59,0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            {aborting ? "ABORTING..." : "■ ABORT"}
          </button>
        )}
        {(job.status === "done" || job.status === "cancelled") && (
          <a
            href={`${API}/jobs/${id}/export`}
            style={{
              background: "transparent",
              border: "1px solid var(--lime-dim)",
              color: "var(--lime)",
              padding: "6px 14px",
              fontFamily: "Share Tech Mono, monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textDecoration: "none",
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--lime-glow)";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--lime)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--lime-dim)";
            }}
          >
            ↓ EXPORT CSV
          </a>
        )}
      </div>

      {/* Progress + stats */}
      <div
        style={{
          padding: "24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div className="progress-track" style={{ flex: 1 }}>
            <div
              className="progress-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "var(--lime)",
              flexShrink: 0,
              minWidth: 48,
              textAlign: "right",
            }}
          >
            {percentage}%
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 20 }}>
          <span style={{ color: "var(--lime)" }}>{job.doneUrls.toLocaleString()}</span>
          <span>/</span>
          <span>{(job.totalUrls || 0).toLocaleString()} pages analyzed</span>
          {job.failedUrls > 0 && (
            <span style={{ marginLeft: 12, color: "var(--red)" }}>
              {job.failedUrls} failed
            </span>
          )}
          {isActive && <span className="blink" style={{ marginLeft: 8, color: "var(--lime-dim)" }}>scanning</span>}
        </div>

        {/* Avg metrics */}
        {doneResults.length > 0 && (
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {[
              { label: "AVG LCP", val: fmtMs(avg("lcp")), cls: scoreClass(avg("lcp"), "ms") },
              { label: "AVG CLS", val: fmt(avg("cls"), "", 3), cls: scoreClass(avg("cls"), "cls") },
              { label: "AVG INP", val: fmtMs(avg("inp")), cls: scoreClass(avg("inp"), "ms") },
              { label: "AVG TTFB", val: fmtMs(avg("ttfb")), cls: scoreClass(avg("ttfb"), "ms") },
              { label: "AVG PERF", val: avg("perfScore") !== null ? `${Math.round(avg("perfScore")!)}` : "—", cls: scoreClass(avg("perfScore"), "perf") },
              { label: "AVG SEO", val: avg("seoScore") !== null ? `${Math.round(avg("seoScore")!)}` : "—", cls: scoreClass(avg("seoScore"), "perf") },
              { label: "AVG A11Y", val: avg("a11yScore") !== null ? `${Math.round(avg("a11yScore")!)}` : "—", cls: scoreClass(avg("a11yScore"), "perf") },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  padding: "8px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", letterSpacing: "0.15em" }}>{m.label}</span>
                <span className={m.cls} style={{ fontSize: "0.9rem", fontFamily: "Orbitron, monospace", fontWeight: 700 }}>
                  {m.val}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results table */}
      <div style={{ padding: "0 24px", marginTop: 24 }}>
        {results.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", textAlign: "center", padding: "40px 0", letterSpacing: "0.1em" }}>
            {isActive ? (
              <>AWAITING SCAN DATA<span className="blink">...</span></>
            ) : (
              "NO RESULTS"
            )}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="results-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("url")}>URL{arrow("url")}</th>
                    <th onClick={() => toggleSort("lcp")}>LCP{arrow("lcp")}</th>
                    <th onClick={() => toggleSort("cls")}>CLS{arrow("cls")}</th>
                    <th onClick={() => toggleSort("inp")}>INP{arrow("inp")}</th>
                    <th onClick={() => toggleSort("ttfb")}>TTFB{arrow("ttfb")}</th>
                    <th onClick={() => toggleSort("perfScore")}>PERF{arrow("perfScore")}</th>
                    <th onClick={() => toggleSort("seoScore")}>SEO{arrow("seoScore")}</th>
                    <th onClick={() => toggleSort("a11yScore")}>A11Y{arrow("a11yScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className={r.status === "error" ? "error-row" : ""}>
                      <td title={r.url}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {r.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </a>
                      </td>
                      <td className={scoreClass(r.lcp, "ms")}>{fmtMs(r.lcp)}</td>
                      <td className={scoreClass(r.cls, "cls")}>{fmt(r.cls, "", 3)}</td>
                      <td className={scoreClass(r.inp, "ms")}>{fmtMs(r.inp)}</td>
                      <td className={scoreClass(r.ttfb, "ms")}>{fmtMs(r.ttfb)}</td>
                      <td className={scoreClass(r.perfScore, "perf")}>
                        {r.perfScore !== null ? r.perfScore : r.error ? <span style={{ color: "var(--red)", fontSize: "0.7rem" }}>ERR</span> : "—"}
                      </td>
                      <td className={scoreClass(r.seoScore, "perf")}>
                        {r.seoScore ?? "—"}
                      </td>
                      <td className={scoreClass(r.a11yScore, "perf")}>
                        {r.a11yScore ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 24,
                  fontSize: "0.78rem",
                }}
              >
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: page === 1 ? "var(--text-muted)" : "var(--text-dim)",
                    padding: "6px 12px",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    fontFamily: "Share Tech Mono, monospace",
                    fontSize: "0.78rem",
                  }}
                >
                  ← PREV
                </button>
                <span style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}>
                  {page} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: page === pageCount ? "var(--text-muted)" : "var(--text-dim)",
                    padding: "6px 12px",
                    cursor: page === pageCount ? "not-allowed" : "pointer",
                    fontFamily: "Share Tech Mono, monospace",
                    fontSize: "0.78rem",
                  }}
                >
                  NEXT →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
