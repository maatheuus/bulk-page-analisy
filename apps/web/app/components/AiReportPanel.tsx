"use client";

import { useState } from "react";
import { fetchWithRetry } from "@/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const idx = (m: RegExpMatchArray | null) =>
      m ? remaining.indexOf(m[0]) : Infinity;

    const boldIdx = idx(boldMatch);
    const italicIdx = boldMatch ? Infinity : idx(italicMatch); // skip italic if bold starts same
    const linkIdx = idx(linkMatch);
    const codeIdx = idx(codeMatch);
    const first = Math.min(boldIdx, italicIdx, linkIdx, codeIdx);

    if (first === Infinity) {
      tokens.push(<span key={k++}>{remaining}</span>);
      break;
    }

    if (first > 0) tokens.push(<span key={k++}>{remaining.slice(0, first)}</span>);

    if (first === boldIdx && boldMatch) {
      tokens.push(<strong key={k++} className="text-(--lime-dim) font-bold">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (first === italicIdx && italicMatch) {
      tokens.push(<em key={k++} className="text-(--text-dim) not-italic opacity-90">{italicMatch[1]}</em>);
      remaining = remaining.slice(italicIdx + italicMatch[0].length);
    } else if (first === linkIdx && linkMatch) {
      tokens.push(
        <a key={k++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="text-(--lime) underline decoration-dotted hover:text-(--lime-dim) transition-colors">
          {linkMatch[1]} ↗
        </a>
      );
      remaining = remaining.slice(linkIdx + linkMatch[0].length);
    } else if (codeMatch) {
      tokens.push(
        <code key={k++} className="text-(--amber) bg-(--bg-panel) px-1 text-[0.68rem] border border-(--border)">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return tokens.length === 1 ? tokens[0] : <>{tokens}</>;
}

function MarkdownReport({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let k = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // H1
    if (/^# /.test(line)) {
      elements.push(
        <h1 key={k++} className="text-(--lime) text-[0.9rem] tracking-[0.3em] mt-8 mb-3 border-b border-(--border) pb-2 uppercase font-['Orbitron']">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (/^## /.test(line)) {
      elements.push(
        <h2 key={k++} className="text-(--lime) text-[0.78rem] tracking-[0.25em] mt-7 mb-2 border-b border-(--border) pb-1.5 uppercase">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (/^### /.test(line)) {
      elements.push(
        <h3 key={k++} className="text-(--amber) text-[0.72rem] tracking-widest mt-4 mb-1.5">
          ▸ {renderInline(line.slice(4))}
        </h3>
      );
    } else if (/^#{4,} /.test(line)) {
      elements.push(
        <h4 key={k++} className="text-(--text-dim) text-[0.7rem] tracking-widest mt-3 mb-1 uppercase">
          {renderInline(line.replace(/^#{4,} /, ""))}
        </h4>
      );
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(<hr key={k++} className="border-(--border) my-4" />);
    } else if (/^> /.test(line)) {
      elements.push(
        <blockquote key={k++} className="border-l-2 border-(--lime-dim) pl-3 my-1.5 text-[0.7rem] text-(--text-dim) italic">
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (/^[-*+] /.test(line)) {
      elements.push(
        <div key={k++} className="flex gap-2 text-[0.72rem] text-(--text) leading-relaxed ml-2 mb-1">
          <span className="text-(--lime-dim) shrink-0 mt-0.5">·</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1] ?? "";
      elements.push(
        <div key={k++} className="flex gap-2 text-[0.72rem] text-(--text) leading-relaxed ml-2 mb-1">
          <span className="text-(--lime-dim) shrink-0 font-['Orbitron'] text-[0.65rem] mt-0.5">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
    } else if (/^(\s{2,}|\t)/.test(line) && trimmed !== "") {
      elements.push(
        <p key={k++} className="text-[0.7rem] text-(--text-dim) leading-relaxed ml-5 mb-0.5">
          {renderInline(trimmed)}
        </p>
      );
    } else if (trimmed === "") {
      elements.push(<div key={k++} className="h-2" />);
    } else {
      elements.push(
        <p key={k++} className="text-[0.72rem] text-(--text) leading-relaxed mb-1">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}

interface ReportMeta {
  id: string;
  createdAt: string;
}

interface AiReportPanelProps {
  jobId: string;
}

export function AiReportPanel({ jobId }: AiReportPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReportMeta[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  async function loadHistory() {
    try {
      const res = await fetchWithRetry(`${API}/jobs/${jobId}/ai-reports`);
      if (!res.ok) return;
      const list = await res.json() as ReportMeta[];
      setHistory(list);
      return list;
    } catch {
      return [];
    }
  }

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetchWithRetry(`${API}/jobs/${jobId}/ai-reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as { report: string };
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  async function openPanel() {
    setOpen(true);
    const list = await loadHistory();
    if (list && list.length > 0) {
      setCurrentIdx(0);
      await loadReport(list[0].id);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetchWithRetry(`${API}/jobs/${jobId}/ai-report`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Failed");
      }
      const data = await res.json() as { id: string; report: string; createdAt: string };
      setReport(data.report);
      const newMeta: ReportMeta = { id: data.id, createdAt: data.createdAt };
      setHistory((h) => [newMeta, ...h]);
      setCurrentIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function navigateTo(idx: number) {
    setCurrentIdx(idx);
    await loadReport(history[idx].id);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <>
      <button
        onClick={openPanel}
        className="flex items-center gap-2 px-3.5 py-1.5 border border-(--lime-dim) text-(--lime) text-[0.7rem] tracking-[0.15em] hover:border-(--lime) hover:bg-(--lime-glow) transition-all cursor-pointer font-['Share_Tech_Mono']"
      >
        ⚡ AI REPORT
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setOpen(false)}
          />

          <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-(--bg) border-l border-(--border) z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--border) bg-(--bg-panel) shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-(--lime) text-[0.8rem] tracking-[0.2em]">⚡ AI PERFORMANCE REPORT</span>
                <span className="text-(--text-muted) text-[0.62rem] tracking-widest">Gemini 2.5 Flash</span>
              </div>
              <div className="flex items-center gap-3">
                {!loading && (
                  <button
                    onClick={generate}
                    className="text-(--lime-dim) text-[0.65rem] tracking-widest hover:text-(--lime) transition-colors cursor-pointer font-['Share_Tech_Mono'] border border-(--lime-dim) hover:border-(--lime) px-2 py-0.5"
                  >
                    + NEW REPORT
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-(--text-dim) hover:text-(--lime) transition-colors cursor-pointer text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {history.length > 1 && (
              <div className="flex items-center gap-1 px-5 py-2 border-b border-(--border) bg-(--bg-panel) shrink-0 overflow-x-auto">
                {history.map((h, i) => (
                  <button
                    key={h.id}
                    onClick={() => navigateTo(i)}
                    className={`text-[0.62rem] tracking-widest px-2.5 py-1 whitespace-nowrap cursor-pointer font-['Share_Tech_Mono'] transition-colors border ${
                      i === currentIdx
                        ? "border-(--lime-dim) text-(--lime) bg-(--lime-glow)"
                        : "border-(--border) text-(--text-muted) hover:text-(--text-dim) hover:border-(--border-bright)"
                    }`}
                  >
                    #{history.length - i} · {formatDate(h.createdAt)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex flex-col items-center justify-center h-48 gap-4">
                  <div className="text-(--lime-dim) text-[0.78rem] tracking-[0.2em]">
                    ANALYZING PERFORMANCE DATA<span className="blink">...</span>
                  </div>
                  <div className="text-(--text-muted) text-[0.65rem] tracking-widest">This may take a few seconds</div>
                </div>
              )}

              {!loading && !report && !error && (
                <div className="flex flex-col items-center justify-center h-48 gap-4">
                  <div className="text-(--text-muted) text-[0.72rem] tracking-widest">No reports yet</div>
                  <button
                    onClick={generate}
                    className="border border-(--lime-dim) text-(--lime) text-[0.7rem] tracking-[0.15em] px-4 py-2 hover:border-(--lime) hover:bg-(--lime-glow) transition-all cursor-pointer font-['Share_Tech_Mono']"
                  >
                    ⚡ GENERATE FIRST REPORT
                  </button>
                </div>
              )}

              {error && !loading && (
                <div className="border border-(--red)/40 bg-red-950/10 p-4 mt-2">
                  <div className="text-(--red) text-[0.72rem] tracking-widest">{error}</div>
                  <button
                    onClick={generate}
                    className="mt-3 text-(--text-dim) text-[0.65rem] tracking-widest hover:text-(--text) cursor-pointer font-['Share_Tech_Mono']"
                  >
                    ↻ TRY AGAIN
                  </button>
                </div>
              )}

              {report && !loading && <MarkdownReport text={report} />}
            </div>
          </div>
        </>
      )}
    </>
  );
}
