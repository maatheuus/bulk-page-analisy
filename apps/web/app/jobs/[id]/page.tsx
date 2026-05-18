"use client";

import { AiReportPanel } from "@/components/AiReportPanel";
import { FilterBar } from "@/components/FilterBar";
import { JobHeader } from "@/components/JobHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultDrawer } from "@/components/ResultDrawer";
import { ResultsTable } from "@/components/ResultsTable";
import { StatsOverview } from "@/components/StatsOverview";
import { WorstPagesPanel } from "@/components/WorstPagesPanel";
import { Job, SortKey, UrlResult } from "@/types";
import { fetchWithRetry } from "@/utils";
import { use, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<UrlResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("perfScore");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [notifDismissed, setNotifDismissed] = useState(true);
  const [drawerResultId, setDrawerResultId] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const notifiedRef = useRef(false);

  async function fetchResults(p = page) {
    const res = await fetchWithRetry(`${API}/jobs/${id}/results?page=${p}`);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results);
      setTotal(data.total);
    }
  }

  const handleResume = async () => {
    const res = await fetchWithRetry(`${API}/jobs/${id}/resume`, { method: "POST" });
    if (res.ok) {
      window.location.reload();
    }
  };

  const handleRetry = async (resultId: string) => {
    try {
      const res = await fetchWithRetry(
        `${API}/jobs/${id}/results/${resultId}/retry`,
        { method: "POST" },
      );
      if (res.ok) {
        fetchResults(page);
      }
    } catch (err) {
      console.error("Failed to retry", err);
    }
  };

  useEffect(() => {
    const dismissed = localStorage.getItem("notif_dismissed") === "1";
    setNotifDismissed(dismissed || Notification.permission === "granted");
  }, []);

  function fireNotification(j: Job) {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    const done = j.status === "done";
    document.title = done
      ? `✓ DONE | BULK ANALYZER`
      : `✗ FAILED | BULK ANALYZER`;
    if (Notification.permission === "granted") {
      new Notification(done ? "Scan Complete" : "Scan Failed", {
        body: `${j.siteUrl} — ${j.doneUrls} pages analyzed`,
        icon: "/favicon.ico",
      });
    }
  }

  useEffect(() => {
    fetchWithRetry(`${API}/jobs/${id}`)
      .then((r) => r.json())
      .then((j) => {
        setJob(j);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetchResults(1);

    const es = new EventSource(`${API}/jobs/${id}/stream`);
    sseRef.current = es;
    es.onmessage = (e) => {
      const updated: Job = JSON.parse(e.data);
      setJob(updated);
      fetchResults(1);

      // Update tab title with progress
      if (updated.status === "auditing" && updated.totalUrls > 0) {
        const pct = Math.round(
          ((updated.doneUrls + updated.failedUrls) / updated.totalUrls) * 100,
        );
        document.title = `SCANNING ${pct}% | BULK ANALYZER`;
      }
      if (updated.status === "done" || updated.status === "failed") {
        fireNotification(updated);
      }
    };
    es.onerror = () => es.close();
    return () => {
      es.close();
      document.title = "BULK ANALYZER";
    };
  }, [id]);

  useEffect(() => {
    fetchResults(page);
  }, [page]);

  const filteredResults = results.filter((r) => {
    const matchesQuery = r.url
      .toLowerCase()
      .includes(filterQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesQuery && matchesStatus;
  });

  const sorted = [...filteredResults].sort((a, b) => {
    const av = a[sort] ?? (order === "asc" ? Infinity : -Infinity);
    const bv = b[sort] ?? (order === "asc" ? Infinity : -Infinity);
    if (typeof av === "string")
      return order === "asc"
        ? av.localeCompare(bv as string)
        : (bv as string).localeCompare(av);
    return order === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-(--lime-dim) tracking-[0.2em] text-[0.8rem]">
          LOADING<span className="blink">...</span>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-(--red)">Job not found</div>
      </main>
    );
  }

  const isActive = job.status !== "done" && job.status !== "failed";
  const pageCount = Math.max(1, Math.ceil(total / 50));

  async function requestNotifPermission() {
    await Notification.requestPermission();
    setNotifDismissed(true);
  }

  function dismissNotifBanner() {
    localStorage.setItem("notif_dismissed", "1");
    setNotifDismissed(true);
  }

  return (
    <main className="min-h-screen pb-20 relative z-[1]">
      {!notifDismissed && (
        <div className="animate-fade-up bg-(--bg-panel) border-b border-(--border) px-6 py-2.5 flex items-center gap-4 text-[0.72rem] tracking-widest">
          <span className="text-(--text-dim)">[ ALLOW NOTIFICATIONS? ]</span>
          <button
            onClick={requestNotifPermission}
            className="text-(--lime) hover:text-(--lime) border border-(--lime-dim) hover:border-(--lime) px-2.5 py-0.5 cursor-pointer transition-colors font-['Share_Tech_Mono']"
          >
            ALLOW
          </button>
          <button
            onClick={dismissNotifBanner}
            className="text-(--text-muted) hover:text-(--text-dim) cursor-pointer transition-colors font-['Share_Tech_Mono']"
          >
            SKIP
          </button>
        </div>
      )}
      <JobHeader
        job={job}
        onCancel={() => setJob((j) => (j ? { ...j, status: "cancelled" } : j))}
        onResume={handleResume}
      />

      <div className="max-w-screen-xl mx-auto px-6 sm:px-10">
        <div className="py-6 border-b border-(--border)">
          <ProgressBar job={job} />

          <div className="flex gap-1 text-[0.72rem] text-(--text-dim) mb-5">
            <span className="text-(--lime)">
              {job.doneUrls.toLocaleString()}
            </span>
            <span>/</span>
            <span>{(job.totalUrls || 0).toLocaleString()} pages analyzed</span>
            {job.failedUrls > 0 && (
              <span className="ml-3 text-(--red)">{job.failedUrls} failed</span>
            )}
            {isActive && (
              <span className="blink ml-2 text-(--lime-dim)">scanning</span>
            )}
          </div>

          {results.length > 0 && <StatsOverview results={results} />}
          {results.length > 0 && (
            <WorstPagesPanel results={results} onRowClick={setDrawerResultId} />
          )}

          {job.status === "done" && (
            <div className="mt-5 flex justify-end">
              <AiReportPanel jobId={id} />
            </div>
          )}
        </div>

        <div className="mt-6">
          <FilterBar
            onFilterChange={setFilterQuery}
            onStatusChange={setFilterStatus}
          />

          {results.length === 0 && (
            <div className="text-(--text-dim) text-[0.8rem] text-center py-10 tracking-widest">
              {isActive ? (
                <>
                  AWAITING SCAN DATA<span className="blink">...</span>
                </>
              ) : (
                "NO RESULTS"
              )}
            </div>
          )}

          {results.length > 0 && (
            <>
              <ResultsTable
                results={sorted}
                sort={sort}
                order={order}
                onSort={toggleSort}
                onRetry={handleRetry}
                onRowClick={setDrawerResultId}
              />
              <ResultDrawer
                jobId={id}
                resultId={drawerResultId}
                onClose={() => setDrawerResultId(null)}
              />

              {/* Pagination */}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 text-[0.78rem]">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="bg-transparent border border-(--border) text-(--text-dim) px-3 py-1.5 cursor-pointer font-['Share_Tech_Mono'] disabled:opacity-50 disabled:cursor-not-allowed hover:border-(--lime-dim) transition-colors"
                  >
                    ← PREV
                  </button>
                  <span className="text-(--text-dim) tracking-widest">
                    {page} / {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                    className="bg-transparent border border-(--border) text-(--text-dim) px-3 py-1.5 cursor-pointer font-['Share_Tech_Mono'] disabled:opacity-50 disabled:cursor-not-allowed hover:border-(--lime-dim) transition-colors"
                  >
                    NEXT →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
