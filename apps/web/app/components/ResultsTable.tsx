"use client";

import { SortKey, UrlResult } from "@/types";

interface ResultsTableProps {
  results: UrlResult[];
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onRetry: (resultId: string) => void;
  onRowClick: (resultId: string) => void;
}

export function ResultsTable({
  results,
  sort,
  order,
  onSort,
  onRetry,
  onRowClick,
}: ResultsTableProps) {
  function scoreClass(v: number | null, type: "perf" | "ms" | "cls"): string {
    if (v === null) return "";
    if (type === "perf") {
      if (v >= 90) return "text-(--lime)";
      if (v >= 50) return "text-(--amber)";
      return "text-(--red)";
    }
    if (type === "ms") {
      if (v <= 1500) return "text-(--lime)";
      if (v <= 3500) return "text-(--amber)";
      return "text-(--red)";
    }
    if (type === "cls") {
      if (v <= 0.1) return "text-(--lime)";
      if (v <= 0.25) return "text-(--amber)";
      return "text-(--red)";
    }
    return "";
  }

  function fmt(v: number | null, unit: string, decimals = 0): string {
    if (v === null) return "—";
    return `${v.toFixed(decimals)}${unit}`;
  }

  function fmtMs(v: number | null): string {
    if (v === null) return "—";
    return v >= 1000
      ? `${((v as number) / 1000).toFixed(1)}s`
      : `${Math.round(v as number)}ms`;
  }

  const arrow = (key: SortKey) => {
    if (sort !== key) return " ↕";
    return order === "asc" ? " ↑" : " ↓";
  };

  const getPsiLink = (url: string) => {
    const encoded = encodeURIComponent(url);
    return `https://pagespeed.web.dev/analysis?url=${encoded}`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.78rem]">
        <thead>
          <tr>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime)"
              onClick={() => onSort("url")}
              title="The page address"
            >
              URL{arrow("url")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("lcp")}
              title="Largest Contentful Paint: Measures loading performance"
            >
              LCP{arrow("lcp")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("cls")}
              title="Cumulative Layout Shift: Measures visual stability"
            >
              CLS{arrow("cls")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("inp")}
              title="Interaction to Next Paint: Measures responsiveness"
            >
              INP{arrow("inp")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("ttfb")}
              title="Time to First Byte: Measures server responsiveness"
            >
              TTFB{arrow("ttfb")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("perfScore")}
              title="Overall Lighthouse Performance Score"
            >
              PERF{arrow("perfScore")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("seoScore")}
              title="Lighthouse Search Engine Optimization Score"
            >
              SEO{arrow("seoScore")}
            </th>
            <th
              className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap cursor-pointer select-none hover:text-(--lime) text-center"
              onClick={() => onSort("a11yScore")}
              title="Lighthouse Accessibility Score"
            >
              A11Y{arrow("a11yScore")}
            </th>
            <th className="text-(--lime-dim) text-left p-2 px-3 border-b border-(--border) tracking-wider text-[0.7rem] uppercase whitespace-nowrap text-center">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r.id)}
              className={`${r.status === "error" ? "text-(--text-dim)" : ""} hover:bg-(--bg-hover) border-b border-(--border) cursor-pointer`}
            >
              <td
                className="p-1.5 px-3 max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap"
                title={r.url}
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-inherit no-underline hover:text-(--lime)"
                >
                  {r.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                </a>
              </td>
              <td
                className={`${scoreClass(r.lcp, "ms")} p-1.5 px-3 text-center`}
              >
                {fmtMs(r.lcp)}
              </td>
              <td
                className={`${scoreClass(r.cls, "cls")} p-1.5 px-3 text-center`}
              >
                {fmt(r.cls, "", 3)}
              </td>
              <td
                className={`${scoreClass(r.inp, "ms")} p-1.5 px-3 text-center`}
              >
                {fmtMs(r.inp)}
              </td>
              <td
                className={`${scoreClass(r.ttfb, "ms")} p-1.5 px-3 text-center`}
              >
                {fmtMs(r.ttfb)}
              </td>
              <td
                className={`${scoreClass(r.perfScore, "perf")} p-1.5 px-3 text-center`}
              >
                {r.perfScore !== null ? (
                  r.perfScore
                ) : r.error ? (
                  <span className="text-(--red) text-[0.7rem]">ERR</span>
                ) : (
                  "—"
                )}
              </td>
              <td
                className={`${scoreClass(r.seoScore, "perf")} p-1.5 px-3 text-center`}
              >
                {r.seoScore ?? "—"}
              </td>
              <td
                className={`${scoreClass(r.a11yScore, "perf")} p-1.5 px-3 text-center`}
              >
                {r.a11yScore ?? "—"}
              </td>
              <td className="p-1.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-2">
                <a
                  href={getPsiLink(r.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in PageSpeed Insights"
                  className="text-(--lime-dim) hover:text-(--lime) transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
                {r.status === "error" && (
                  <button
                    onClick={() => onRetry(r.id)}
                    title="Retry analysis"
                    className="text-(--amber) hover:text-(--lime) transition-colors cursor-pointer"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M23 4v6h-6"></path>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                  </button>
                )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
