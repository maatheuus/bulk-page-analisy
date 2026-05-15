"use client";

import { Job } from "@/types";
import { statusColor } from "@/utils";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface JobHeaderProps {
  job: Job;
}

export function JobHeader({ job }: JobHeaderProps) {
  const isActive = job.status !== "done" && job.status !== "failed";

  return (
    <div className="border-b border-(--border) bg-[rgba(6,10,8,0.95)] backdrop-blur-[4px] p-4 px-6 flex items-center gap-4 sticky top-0 z-10">
      <Link
        href="/"
        className="text-(--text-dim) no-underline text-[0.8rem] tracking-widest flex items-center gap-1.5 hover:text-(--lime) transition-colors"
      >
        ← BACK
      </Link>
      <div className="w-px h-5 bg-(--border)" />
      <div className="flex-1 overflow-hidden">
        <div className="font-['Orbitron'] text-[0.75rem] font-bold text-(--lime) tracking-widest overflow-hidden text-ellipsis whitespace-nowrap">
          {job.siteUrl}
        </div>
        <div className="text-[0.65rem] text-(--text-dim) mt-0.5 tracking-widest">
          SCAN ID: {job.id}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: `var(--${statusColor(job.status)})`,
            boxShadow: isActive
              ? `0 0 8px var(--${statusColor(job.status)})`
              : "none",
            animation: isActive
              ? "pulse-dot 1.5s ease-in-out infinite"
              : "none",
          }}
        />
        <span
          className="text-[0.7rem] tracking-widest"
          style={{ color: `var(--${statusColor(job.status)})` }}
        >
          {job.status.toUpperCase()}
        </span>
      </div>
      {job.status === "done" && (
        <a
          href={`${API}/jobs/${job.id}/export`}
          className="bg-transparent border border-(--lime-dim) text-(--lime) px-3.5 py-1.5 font-['Share_Tech_Mono'] text-[0.7rem] tracking-widest no-underline cursor-pointer hover:bg-(--lime-glow) hover:border-(--lime) transition-all"
        >
          ↓ EXPORT CSV
        </a>
      )}
    </div>
  );
}
