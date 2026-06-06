import { decodeHtmlResponse } from "./html-encoding.ts";

export interface FetchOutcome {
  ok: boolean;
  status: number | null;
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

    const status = response.status;

    if (status === 404) {
      return {
        ok: false,
        status: 404,
        body: null,
        error: "HTTP 404 Not Found",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status,
        body: null,
        error: `HTTP ${status} ${response.statusText}`,
      };
    }

    const body = await decodeHtmlResponse(response);
    return { ok: true, status, body, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, body: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}
