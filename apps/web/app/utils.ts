import { SortKey, UrlResult, Job } from "./types";

export function scoreClass(v: number | null, type: "perf" | "ms" | "cls"): string {
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

export function fmt(v: number | null, unit: string, decimals = 0): string {
  if (v === null) return "—";
  return `${v.toFixed(decimals)}${unit}`;
}

export function fmtMs(v: number | null): string {
  if (v === null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

export function statusColor(s: string): string {
  if (s === "done") return "lime";
  if (s === "failed" || s === "error") return "red";
  if (s === "cancelled") return "amber";
  return "amber";
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchWithRetry(url: string, options?: RequestInit, retries = 2): Promise<Response> {
  const opts: RequestInit = {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.headers ?? {}) },
  };
  try {
    const res = await fetch(url, opts);
    if (!res.ok && retries > 0 && res.status !== 401) {
      return fetchWithRetry(url, options, retries - 1);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}
