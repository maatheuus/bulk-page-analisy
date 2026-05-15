"use client";

import { useEffect, useState } from "react";
import { UrlResult } from "@/types";
import { scoreClass, fmtMs, fmt, fetchWithRetry } from "@/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Opportunity {
  id: string;
  title: string;
  description: string;
  savingsMs: number;
}

interface ResultDrawerProps {
  jobId: string;
  resultId: string | null;
  onClose: () => void;
}

const METRICS = [
  { key: "lcp" as const, label: "LCP", type: "ms" as const, desc: "Largest Contentful Paint", fmt: fmtMs },
  { key: "cls" as const, label: "CLS", type: "cls" as const, desc: "Cumulative Layout Shift", fmt: (v: number) => fmt(v, "", 3) },
  { key: "inp" as const, label: "INP", type: "ms" as const, desc: "Interaction to Next Paint", fmt: fmtMs },
  { key: "ttfb" as const, label: "TTFB", type: "ms" as const, desc: "Time to First Byte", fmt: fmtMs },
  { key: "perfScore" as const, label: "PERF", type: "perf" as const, desc: "Performance Score", fmt: (v: number) => String(v) },
  { key: "seoScore" as const, label: "SEO", type: "perf" as const, desc: "SEO Score", fmt: (v: number) => String(v) },
  { key: "a11yScore" as const, label: "A11Y", type: "perf" as const, desc: "Accessibility Score", fmt: (v: number) => String(v) },
];

function MetricBar({ value, type }: { value: number | null; type: "ms" | "cls" | "perf" }) {
  if (value === null) return <div className="h-1 bg-(--border) w-full" />;
  let pct = 0;
  if (type === "perf") pct = value;
  else if (type === "ms") pct = Math.max(0, 100 - (value / 5000) * 100);
  else if (type === "cls") pct = Math.max(0, 100 - (value / 0.5) * 100);
  return (
    <div className="h-1 bg-(--border) w-full relative overflow-hidden">
      <div
        className={`h-full transition-all duration-500 ${scoreClass(value, type).replace("text-", "bg-")}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function AiTipsSection({ jobId, resultId }: { jobId: string; resultId: string }) {
  const [tips, setTips] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTips() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithRetry(`${API}/jobs/${jobId}/results/${resultId}/ai-tips`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { tips: string };
      setTips(data.tips);
    } catch {
      setError("Failed to generate tips.");
    } finally {
      setLoading(false);
    }
  }

  if (!tips && !loading && !error) {
    return (
      <button
        onClick={fetchTips}
        className="w-full border border-(--lime-dim) text-(--lime) text-[0.65rem] tracking-[0.15em] py-2 hover:border-(--lime) hover:bg-(--lime-glow) transition-all cursor-pointer font-['Share_Tech_Mono'] mt-4"
      >
        ⚡ GET AI TIPS FOR THIS PAGE
      </button>
    );
  }

  return (
    <div className="mt-4 border border-(--border) bg-(--bg-panel) p-4">
      <div className="text-[0.6rem] text-(--lime-dim) tracking-widest uppercase mb-3 flex items-center justify-between">
        <span>⚡ AI Tips</span>
        {tips && (
          <button onClick={fetchTips} className="text-(--text-muted) hover:text-(--text-dim) cursor-pointer font-['Share_Tech_Mono']">
            ↻
          </button>
        )}
      </div>
      {loading && (
        <div className="text-(--text-dim) text-[0.7rem] tracking-widest">
          GENERATING<span className="blink">...</span>
        </div>
      )}
      {error && <div className="text-(--red) text-[0.7rem]">{error}</div>}
      {tips && !loading && (
        <div className="text-[0.7rem] text-(--text) leading-relaxed whitespace-pre-wrap">{tips}</div>
      )}
    </div>
  );
}

export function ResultDrawer({ jobId, resultId, onClose }: ResultDrawerProps) {
  const [result, setResult] = useState<(UrlResult & { opportunities?: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resultId) { setResult(null); return; }
    setLoading(true);
    fetchWithRetry(`${API}/jobs/${jobId}/results/${resultId}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [resultId, jobId]);

  const open = !!resultId;
  const opportunities: Opportunity[] = result?.opportunities ? JSON.parse(result.opportunities) : [];

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[480px] bg-(--bg) border-l border-(--border) z-50 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="border-b border-(--border) p-4 px-5 flex items-center gap-3 bg-(--bg-panel)">
          <button onClick={onClose} className="text-(--text-dim) hover:text-(--lime) transition-colors cursor-pointer font-['Share_Tech_Mono'] text-[1rem]">
            ×
          </button>
          <div className="flex-1 overflow-hidden">
            <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-0.5">Page Details</div>
            <div className="text-[0.75rem] text-(--text) overflow-hidden text-ellipsis whitespace-nowrap font-['Share_Tech_Mono']">
              {result?.url ?? ""}
            </div>
          </div>
          {result && (
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(result.url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--lime-dim) hover:text-(--lime) text-[0.65rem] tracking-widest border border-(--border) hover:border-(--lime-dim) px-2 py-1 no-underline transition-colors font-['Share_Tech_Mono']"
            >
              PSI ↗
            </a>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="text-(--lime-dim) tracking-widest text-[0.8rem]">LOADING<span className="blink">...</span></div>
          )}

          {result && !loading && (
            <>
              {/* Metrics */}
              <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-3">Metrics</div>
              <div className="flex flex-col gap-3 mb-6">
                {METRICS.map(({ key, label, type, desc, fmt: fmtVal }) => {
                  const v = result[key] as number | null;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.65rem] text-(--text-dim) tracking-widest">{label} <span className="text-(--text-muted)">· {desc}</span></span>
                        <span className={`font-['Orbitron'] text-[0.8rem] font-bold ${scoreClass(v, type)}`}>
                          {v !== null ? fmtVal(v) : "—"}
                        </span>
                      </div>
                      <MetricBar value={v} type={type} />
                    </div>
                  );
                })}
              </div>

              {/* Opportunities */}
              {opportunities.length > 0 && (
                <>
                  <div className="text-[0.6rem] text-(--text-muted) tracking-widest uppercase mb-3">
                    Top Opportunities
                  </div>
                  <div className="flex flex-col gap-2">
                    {opportunities.map((opp) => (
                      <div key={opp.id} className="border border-(--border) bg-(--bg-panel) p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-[0.75rem] text-(--text) font-['Share_Tech_Mono']">{opp.title}</div>
                          <span className="text-(--amber) text-[0.65rem] tracking-widest shrink-0 font-['Orbitron'] font-bold">
                            -{fmtMs(opp.savingsMs)}
                          </span>
                        </div>
                        <div className="text-[0.65rem] text-(--text-muted) leading-relaxed">{opp.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {result.status === "done" && (
                <AiTipsSection jobId={jobId} resultId={result.id} />
              )}

              {result.error && (
                <div className="border border-(--red)/30 bg-red-950/20 p-3 mt-4">
                  <div className="text-[0.6rem] text-(--red) tracking-widest uppercase mb-1">Error</div>
                  <div className="text-[0.72rem] text-(--text-dim) font-['Share_Tech_Mono']">{result.error}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
