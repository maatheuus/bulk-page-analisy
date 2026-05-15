"use client";

import { Job } from "@/types";

interface ProgressBarProps {
  job: Job;
}

export function ProgressBar({ job }: ProgressBarProps) {
  const percentage = job.totalUrls
    ? Math.min(
        100,
        Math.round(((job.doneUrls + job.failedUrls) / job.totalUrls) * 100),
      )
    : 0;

  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="flex-1 h-1.5 bg-(--bg-panel) border border-(--border) relative overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-(--lime-dim) to-(--lime) shadow-[0_0_8px_var(--lime-glow)] transition-[width] duration-700 ease-in-out relative"
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-y-0 right-0 w-5 bg-gradient-to-r from-transparent to-[rgba(57,255,90,0.8)] animate-[shimmer_1.2s_linear_infinite]" />
        </div>
      </div>
      <div className="font-['Orbitron'] text-[0.85rem] font-bold text-(--lime) shrink-0 min-w-[48px] text-right">
        {percentage}%
      </div>
    </div>
  );
}
