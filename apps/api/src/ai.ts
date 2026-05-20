const GEMINI_MODEL = "gemini-2.5-flash";
const BATCH_SIZE = 5;

export async function callGemini(
  key: string,
  prompt: string,
  opts: { temperature: number; maxOutputTokens: number }
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: opts,
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error("AI service error"), { detail, status: res.status });
  }
  const data = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function validateLinks(text: string): Promise<string> {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const found: Array<{ full: string; label: string; url: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(text)) !== null) {
    found.push({ full: m[0], label: m[1], url: m[2] });
  }
  if (found.length === 0) return text;

  async function checkLink(item: { full: string; label: string; url: string }) {
    try {
      const res = await fetch(item.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BulkAnalyzer/1.0)" },
        redirect: "follow",
      });
      return { ...item, ok: res.ok || res.status === 405 || res.status === 403 };
    } catch {
      return { ...item, ok: false };
    }
  }

  const checked: Array<{ full: string; label: string; ok: boolean }> = [];
  for (let i = 0; i < found.length; i += BATCH_SIZE) {
    const batch = await Promise.all(found.slice(i, i + BATCH_SIZE).map(checkLink));
    checked.push(...batch);
  }

  let out = text;
  for (const { full, label, ok } of checked) {
    if (!ok) out = out.replaceAll(full, `**${label}**`);
  }
  return out;
}
