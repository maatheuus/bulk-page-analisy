"use client";

import { useState, useEffect, useRef, use } from "react";
import { Job, UrlResult, SortKey } from "@/types";
import { fetchWithRetry } from "@/utils";
import { JobHeader } from "@/components/JobHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { StatsOverview } from "@/components/StatsOverview";
import { FilterBar } from "@/components/FilterBar";
import { ResultsTable } from "@/components/ResultsTable";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
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
  const sseRef = useRef<EventSource | null>(null);

  async function fetchResults(p = page) {
    const res = await fetchWithRetry(`${API}/jobs/${id}/results?page=${p}`);
    if (res.ok) {
      const data = await res.json();
      setResults(data.results);
      setTotal(data.total);
    }
  }

  const handleRetry = async (resultId: string) => {
    try {
      const res = await fetchWithRetry(`${API}/jobs/${id}/results/${resultId}/retry`, { method: "POST" });
      if (res.ok) {
        fetchResults(page);
      }
    } catch (err) {
      console.error("Failed to retry", err);
    }
  };

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
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id]);

  useEffect(() => { fetchResults(page); }, [page]);

  const filteredResults = results.filter((r) => {
    const matchesQuery = r.url.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesQuery && matchesStatus;
  });

  const sorted = [...filteredResults].sort((a, b) => {
    const av = a[sort] ?? (order === "asc" ? Infinity : -Infinity);
    const bv = b[sort] ?? (order === "asc" ? Infinity : -Infinity);
    if (typeof av === "string") return order === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return order === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSort(key); setOrder("asc"); }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-[var(--lime-dim)] tracking-[0.2em] text-[0.8rem]">
          LOADING<span className="blink">...</span>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-[var(--red)]">Job not found</div>
      </main>
    );
  }

  const isActive = job.status !== "done" && job.status !== "failed";
  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <main className="min-h-screen pb-20 relative z-[1]">
      <JobHeader job={job} />

      <div className="p-6 border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <ProgressBar job={job} />

        <div className="flex gap-1 text-[0.72rem] text-[var(--text-dim)] mb-5">
          <span className="text-[var(--lime)]">{job.doneUrls.toLocaleString()}</span>
          <span>/</span>
          <span>{(job.totalUrls || 0).toLocaleString()} pages analyzed</span>
          {job.failedUrls > 0 && (
            <span className="ml-3 text-[var(--red)]">
              {job.failedUrls} failed
            </span>
          )}
          {isActive && <span className="blink ml-2 text-[var(--lime-dim)]">scanning</span>}
        </div>

        {results.length > 0 && <StatsOverview results={results} />}
      </div>

      <div className="p-6 pt-6 px-6 mt-6">
        <FilterBar
          onFilterChange={setFilterQuery}
          onStatusChange={setFilterStatus}
        />

        {results.length === 0 && (
          <div className="text-[var(--text-dim)] text-[0.8rem] text-center py-10 tracking-widest">
            {isActive ? (
              <>AWAITING SCAN DATA<span className="blink">...</span></>
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
            />

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 text-[0.78rem]">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="bg-transparent border border-[var(--border)] text-[var(--text-dim)] px-3 py-1.5 cursor-pointer font-['Share_Tech_Mono'] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--lime-dim)] transition-colors"
                >
                  ← PREV
                </button>
                <span className="text-[var(--text-dim)] tracking-widest">
                  {page} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="bg-transparent border border-[var(--border)] text-[var(--text-dim)] px-3 py-1.5 cursor-pointer font-['Share_Tech_Mono'] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--lime-dim)] transition-colors"
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
