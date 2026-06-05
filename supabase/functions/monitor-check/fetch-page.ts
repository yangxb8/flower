import { decodeHtmlResponse } from "./html-encoding.ts";

export interface FetchOutcome {
  ok: boolean;
  body: string | null;
  error: string | null;
}

export async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "flower-keyword-monitor/1.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        ok: false,
        body: null,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const body = await decodeHtmlResponse(response);
    return { ok: true, body, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, body: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}
