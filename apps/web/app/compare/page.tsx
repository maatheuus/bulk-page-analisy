"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Job } from "@/types";
import { fmtMs, fmt, scoreClass } from "@/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Stats = {
  avgLcp: string | null;
  avgCls: string | null;
  avgInp: string | null;
  avgTtfb: string | null;
  avgPerf: string | null;
  avgSeo: string | null;
  avgA11y: string | null;
};

type JobData = { job: Job; stats: Stats };

const METRICS: { key: keyof Stats; label: string; type: "ms" | "cls" | "perf"; fmt: (v: number) => string }[] = [
  { key: "avgLcp", label: "LCP", type: "ms", fmt: fmtMs },
  { key: "avgCls", label: "CLS", type: "cls", fmt: (v) => fmt(v, "", 3) },
  { key: "avgInp", label: "INP", type: "ms", fmt: fmtMs },
  { key: "avgTtfb", label: "TTFB", type: "ms", fmt: fmtMs },
  { key: "avgPerf", label: "PERF", type: "perf", fmt: (v) => String(Math.round(v)) },
  { key: "avgSeo", label: "SEO", type: "perf", fmt: (v) => String(Math.round(v)) },
  { key: "avgA11y", label: "A11Y", type: "perf", fmt: (v) => String(Math.round(v)) },
];

function deltaLabel(a: number, b: number, type: "ms" | "cls" | "perf") {
  const diff = b - a;
  const pct = a !== 0 ? Math.abs(diff / a) * 100 : 0;
  if (pct < 2) return { arrow: "→", color: "text-(--text-dim)" };
  // For ms/cls: lower is better; for perf: higher is better
  const improved = type === "perf" ? diff > 0 : diff < 0;
  return {
    arrow: diff > 0 ? "↑" : "↓",
    color: improved ? "text-(--lime)" : "text-(--red)",
    pct: `${pct.toFixed(0)}%`,
  };
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-(--lime-dim) tracking-[0.2em] text-[0.8rem]">LOADING<span className="blink">...</span></div>
      </main>
    }>
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const params = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");
  const [data, setData] = useState<{ a: JobData; b: JobData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!aId || !bId) { setError("Missing job IDs"); setLoading(false); return; }
    fetch(`${API}/jobs/compare?a=${aId}&b=${bId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load comparison"); setLoading(false); });
  }, [aId, bId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-(--lime-dim) tracking-[0.2em] text-[0.8rem]">
          LOADING<span className="blink">...</span>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="text-(--red)">{error || "Not found"}</div>
      </main>
    );
  }

  const { a, b } = data;

  return (
    <main className="min-h-screen pb-20 relative z-[1]">
      {/* Header */}
      <div className="border-b border-(--border) bg-[rgba(6,10,8,0.95)] backdrop-blur-[4px] sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 sm:px-10 py-4 flex items-center gap-4">
          <Link href="/" className="text-(--text-dim) no-underline text-[0.8rem] tracking-widest flex items-center gap-1.5 hover:text-(--lime) transition-colors">
            ← BACK
          </Link>
          <div className="w-px h-5 bg-(--border)" />
          <div className="font-['Orbitron'] text-[0.75rem] font-bold text-(--lime) tracking-widest">
            COMPARISON · {a.job.siteUrl}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 sm:px-10 py-8">
        {/* Run labels */}
        <div className="grid grid-cols-[1fr_40px_1fr] gap-4 mb-6">
          <div className="bg-(--bg-panel) border border-(--border) p-4">
            <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-1">Run A</div>
            <div className="font-['Orbitron'] text-[0.7rem] text-(--lime) tracking-widest">
              {new Date(a.job.createdAt).toLocaleString()}
            </div>
            <div className="text-[0.65rem] text-(--text-dim) mt-1">{a.job.doneUrls} pages analyzed</div>
          </div>
          <div className="flex items-center justify-center text-(--border-bright) text-lg font-bold">↔</div>
          <div className="bg-(--bg-panel) border border-(--border) p-4">
            <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-1">Run B</div>
            <div className="font-['Orbitron'] text-[0.7rem] text-(--lime) tracking-widest">
              {new Date(b.job.createdAt).toLocaleString()}
            </div>
            <div className="text-[0.65rem] text-(--text-dim) mt-1">{b.job.doneUrls} pages analyzed</div>
          </div>
        </div>

        {/* Metrics comparison */}
        <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-3">Metric Comparison (averages)</div>
        <div className="flex flex-col gap-px">
          {METRICS.map(({ key, label, type, fmt: fmtVal }) => {
            const va = parseFloat(a.stats[key] ?? "0") || 0;
            const vb = parseFloat(b.stats[key] ?? "0") || 0;
            const delta = deltaLabel(va, vb, type);
            return (
              <div key={key} className="grid grid-cols-[1fr_80px_1fr] bg-(--bg-panel) border border-(--border) items-center">
                <div className={`p-3 px-4 text-right font-['Orbitron'] text-[0.85rem] font-bold ${scoreClass(va, type)}`}>
                  {fmtVal(va)}
                </div>
                <div className="flex flex-col items-center py-2 border-x border-(--border)">
                  <span className="text-[0.55rem] text-(--text-muted) tracking-widest uppercase">{label}</span>
                  <span className={`text-[0.85rem] font-bold ${delta.color}`}>
                    {delta.arrow}
                    {delta.pct && <span className="text-[0.6rem] ml-0.5">{delta.pct}</span>}
                  </span>
                </div>
                <div className={`p-3 px-4 font-['Orbitron'] text-[0.85rem] font-bold ${scoreClass(vb, type)}`}>
                  {fmtVal(vb)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-3 text-[0.68rem] text-(--text-dim) tracking-widest">
          <span className="text-(--lime)">↑ improved</span>
          <span className="text-(--red)">↓ regressed</span>
          <span className="text-(--text-dim)">→ no change (&lt;2%)</span>
        </div>
      </div>
    </main>
  );
}
