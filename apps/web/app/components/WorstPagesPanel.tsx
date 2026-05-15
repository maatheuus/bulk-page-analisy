"use client";

import { useState } from "react";
import { UrlResult } from "@/types";
import { scoreClass } from "@/utils";

interface WorstPagesPanelProps {
  results: UrlResult[];
  onRowClick: (resultId: string) => void;
}

export function WorstPagesPanel({ results, onRowClick }: WorstPagesPanelProps) {
  const [open, setOpen] = useState(false);

  const worst = results
    .filter((r) => r.status === "done" && r.perfScore !== null)
    .sort((a, b) => (a.perfScore ?? 100) - (b.perfScore ?? 100))
    .slice(0, 5);

  if (worst.length === 0) return null;

  return (
    <div className="mt-4 border border-(--border) bg-(--bg-panel)">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 px-4 cursor-pointer hover:bg-(--bg-hover) transition-colors text-left"
      >
        <span className="text-(--amber) text-[0.65rem]">⚠</span>
        <span className="text-[0.65rem] text-(--amber) tracking-widest uppercase font-['Share_Tech_Mono']">
          Worst Performing Pages
        </span>
        <span className="text-(--text-muted) text-[0.6rem] ml-1">({worst.length})</span>
        <span className="ml-auto text-(--text-muted) text-[0.7rem]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-(--border)">
          {worst.map((r, i) => {
            const score = r.perfScore ?? 0;
            return (
              <div
                key={r.id}
                onClick={() => onRowClick(r.id)}
                className="flex items-center gap-3 p-2.5 px-4 border-b border-(--border) last:border-0 hover:bg-(--bg-hover) cursor-pointer transition-colors"
              >
                <span className="text-[0.6rem] text-(--text-muted) font-['Orbitron'] w-5 shrink-0">#{i + 1}</span>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[0.75rem] text-(--text) overflow-hidden text-ellipsis whitespace-nowrap font-['Share_Tech_Mono']">
                    {r.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </div>
                  <div className="mt-1 h-0.5 bg-(--border) w-full relative overflow-hidden">
                    <div
                      className={`h-full ${scoreClass(score, "perf").replace("text-", "bg-")}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
                <span className={`font-['Orbitron'] text-[0.8rem] font-bold shrink-0 ${scoreClass(score, "perf")}`}>
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
