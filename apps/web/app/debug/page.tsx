"use client";

import { fetchWithRetry } from "@/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Log = {
  id: string;
  jobId: string | null;
  level: string;
  message: string;
  details: string | null;
  createdAt: string;
};

export default function DebugPage() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetchWithRetry(`${API}/logs`);
        if (res.ok) setLogs(await res.json());
      } catch {}
    };

    fetchLogs();
    const t = setInterval(fetchLogs, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen p-6 relative z-[1]">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="text-(--text-dim) hover:text-(--lime) tracking-widest text-[0.8rem]"
          >
            ← BACK
          </Link>
          <h1 className="font-['Orbitron'] text-xl text-(--lime) tracking-widest font-black">
            SYSTEM_LOGS
          </h1>
        </div>

        <div className="bg-(--bg-panel) border border-(--border) overflow-hidden">
          <table className="w-full text-left text-[0.75rem] border-collapse">
            <thead>
              <tr className="border-b border-(--border) bg-[rgba(255,255,255,0.02)]">
                <th className="p-3 text-(--lime-dim) uppercase tracking-widest">
                  Timestamp
                </th>
                <th className="p-3 text-(--lime-dim) uppercase tracking-widest">
                  Level
                </th>
                <th className="p-3 text-(--lime-dim) uppercase tracking-widest">
                  Job ID
                </th>
                <th className="p-3 text-(--lime-dim) uppercase tracking-widest">
                  Message
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-(--border) hover:bg-(--bg-hover)"
                >
                  <td className="p-3 text-(--text-dim) whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3 font-bold uppercase tracking-widest">
                    <span
                      className={
                        log.level === "error"
                          ? "text-(--red)"
                          : "text-(--lime-dim)"
                      }
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-(--text-muted)">
                    {log.jobId ? (
                      <Link
                        href={`/jobs/${log.jobId}`}
                        className="hover:text-(--lime)"
                      >
                        {log.jobId}
                      </Link>
                    ) : (
                      "SYSTEM"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-(--text)">{log.message}</div>
                    {log.details && (
                      <pre className="mt-2 p-2 bg-black/30 border border-(--border) text-[0.65rem] text-(--text-dim) overflow-x-auto">
                        {log.details}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-(--text-dim) tracking-widest"
                  >
                    NO_LOGS_FOUND
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
