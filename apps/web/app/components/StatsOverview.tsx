"use client";

import { UrlResult } from "@/types";

interface StatsOverviewProps {
  results: UrlResult[];
}

export function StatsOverview({ results }: StatsOverviewProps) {
  const doneResults = results.filter((r) => r.status === "done");

  const avg = (key: keyof UrlResult) => {
    const vals = doneResults.map((r) => r[key]).filter((v) => v !== null) as number[];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  function scoreClass(v: number | null, type: "perf" | "ms" | "cls"): string {
    if (v === null) return "";
    if (type === "perf") {
      if (v >= 90) return "text-[var(--lime)]";
      if (v >= 50) return "text-[var(--amber)]";
      return "text-[var(--red)]";
    }
    if (type === "ms") {
      if (v <= 1500) return "text-[var(--lime)]";
      if (v <= 3500) return "text-[var(--amber)]";
      return "text-[var(--red)]";
    }
    if (type === "cls") {
      if (v <= 0.1) return "text-[var(--lime)]";
      if (v <= 0.25) return "text-[var(--amber)]";
      return "text-[var(--red)]";
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

  const metrics = [
    { label: "AVG LCP", val: fmtMs(avg("lcp")), cls: scoreClass(avg("lcp"), "ms") },
    { label: "AVG CLS", val: fmt(avg("cls"), "", 3), cls: scoreClass(avg("cls"), "cls") },
    { label: "AVG INP", val: fmtMs(avg("inp")), cls: scoreClass(avg("inp"), "ms") },
    { label: "AVG TTFB", val: fmtMs(avg("ttfb")), cls: scoreClass(avg("ttfb"), "ms") },
    { label: "AVG PERF", val: avg("perfScore") !== null ? `${Math.round(avg("perfScore")!)}` : "—", cls: scoreClass(avg("perfScore"), "perf") },
    { label: "AVG SEO", val: avg("seoScore") !== null ? `${Math.round(avg("seoScore")!)}` : "—", cls: scoreClass(avg("seoScore"), "perf") },
    { label: "AVG A11Y", val: avg("a11yScore") !== null ? `${Math.round(avg("a11yScore")!)}` : "—", cls: scoreClass(avg("a11yScore"), "perf") },
  ];

  const descriptions: Record<string, string> = {
    "AVG LCP": "Largest Contentful Paint: Measures loading speed.",
    "AVG CLS": "Cumulative Layout Shift: Measures visual stability.",
    "AVG INP": "Interaction to Next Paint: Measures responsiveness.",
    "AVG TTFB": "Time to First Byte: Measures server response time.",
    "AVG PERF": "Overall Performance score from Lighthouse.",
    "AVG SEO": "Search Engine Optimization score.",
    "AVG A11Y": "Accessibility score for all users.",
  };

  return (
    <div className="flex gap-0.5 flex-wrap">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2 flex flex-col gap-0.5"
          title={descriptions[m.label]}
        >
          <span className="text-[0.6rem] text-[var(--text-muted)] tracking-widest uppercase">{m.label}</span>
          <span className={`${m.cls} text-[0.9rem] font-['Orbitron'] font-bold`}>
            {m.val}
          </span>
        </div>
      ))}
    </div>
  );
}
