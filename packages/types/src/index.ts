export type Job = {
  id: string;
  siteUrl: string;
  status: string;
  formFactor: string;
  totalUrls: number;
  doneUrls: number;
  failedUrls: number;
  createdAt: string;
  finishedAt?: string;
};

export type UrlResult = {
  id: string;
  jobId: string;
  url: string;
  status: string;
  formFactor?: string | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  perfScore: number | null;
  seoScore: number | null;
  a11yScore: number | null;
  error: string | null;
  opportunities?: string | null;
};

export type SortKey = "url" | "lcp" | "cls" | "inp" | "ttfb" | "perfScore" | "seoScore" | "a11yScore";
