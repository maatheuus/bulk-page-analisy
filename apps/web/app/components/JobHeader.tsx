"use client";

import { Job } from "@/types";
import { statusColor } from "@/utils";
import Link from "next/link";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface JobHeaderProps {
  job: Job;
  onCancel?: () => void;
  onResume?: () => void;
}

export function JobHeader({ job, onCancel, onResume }: JobHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [resuming, setResuming] = useState(false);
  const isActive = job.status !== "done" && job.status !== "failed" && job.status !== "cancelled";
  const isResumable = job.status === "cancelled" || job.status === "failed";

  async function handleResume() {
    setResuming(true);
    try {
      await onResume?.();
    } finally {
      setResuming(false);
    }
  }

  async function handleCancel() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    await fetch(`${API}/jobs/${job.id}/cancel`, { method: "POST" });
    setConfirming(false);
    onCancel?.();
  }

  return (
    <div className="border-b border-(--border) bg-[rgba(6,10,8,0.95)] backdrop-blur-[4px] sticky top-0 z-10">
      <div className="max-w-screen-xl mx-auto px-6 sm:px-10 py-4 flex items-center gap-4">
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
      {isActive && (
        <button
          onClick={handleCancel}
          className={`bg-transparent border font-['Share_Tech_Mono'] text-[0.7rem] tracking-widest cursor-pointer transition-all px-3.5 py-1.5 ${
            confirming
              ? "border-(--red) text-(--red) hover:bg-red-950/30"
              : "border-(--border) text-(--amber) hover:border-(--amber)"
          }`}
        >
          {confirming ? "■ CONFIRM?" : "■ CANCEL"}
        </button>
      )}
      {isResumable && (
        <button
          onClick={handleResume}
          disabled={resuming}
          className="bg-transparent border border-(--lime-dim) text-(--lime) px-3.5 py-1.5 font-['Share_Tech_Mono'] text-[0.7rem] tracking-widest cursor-pointer hover:bg-(--lime-glow) hover:border-(--lime) transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resuming ? "RESUMING..." : "► RESUME"}
        </button>
      )}
      {job.status === "done" && (
        <a
          href={`${API}/jobs/${job.id}/export`}
          className="bg-transparent border border-(--lime-dim) text-(--lime) px-3.5 py-1.5 font-['Share_Tech_Mono'] text-[0.7rem] tracking-widest no-underline cursor-pointer hover:bg-(--lime-glow) hover:border-(--lime) transition-all"
        >
          ↓ EXPORT CSV
        </a>
      )}
      </div>
    </div>
  );
}
