"use client";

import { useState } from "react";

interface FilterBarProps {
  onFilterChange: (query: string) => void;
  onStatusChange: (status: string) => void;
}

export function FilterBar({ onFilterChange, onStatusChange }: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1 relative">
        <input
          type="text"
          placeholder="Filter URLs..."
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-full bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text)] font-['Share_Tech_Mono'] text-[0.85rem] px-4 py-2 outline-none focus:border-[var(--lime-dim)] transition-colors"
        />
      </div>
      <select
        onChange={(e) => onStatusChange(e.target.value)}
        className="bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text)] font-['Share_Tech_Mono'] text-[0.85rem] px-3 py-2 outline-none cursor-pointer hover:border-[var(--lime-dim)] transition-colors"
      >
        <option value="all">All Status</option>
        <option value="done">Success</option>
        <option value="error">Failed</option>
        <option value="running">Running</option>
        <option value="queued">Queued</option>
      </select>
    </div>
  );
}
