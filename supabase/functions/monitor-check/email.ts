import type { AlertMatch, AppConfig, MaintenanceMatch } from "./types.ts";

/**
 * Resend without a verified custom domain (sandbox / onboarding mode):
 * - From: `onboarding@resend.dev` only (default when RESEND_FROM is unset)
 * - To: must be the email address on your Resend account (set ALERT_EMAIL to that)
 *
 * After you verify a domain at resend.com/domains, set RESEND_FROM e.g.
 * `Your App <alerts@yourdomain.com>` and ALERT_EMAIL can be any recipient.
 */

const RESEND_URL = "https://api.resend.com/emails";
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function buildBodies(matches: AlertMatch[]): { html: string; text: string } {
  const htmlParts = matches.map(
    (m) =>
      `<section><p><strong>URL:</strong> <a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a></p><p><strong>在庫数 (h4):</strong></p><pre>${escapeHtml(m.h4_text)}</pre></section>`,
  );
  const textParts = matches.map(
    (m) => `URL: ${m.url}\n在庫数 (h4):\n${m.h4_text}`,
  );
  return {
    html: `<div>${htmlParts.join("<hr/>")}</div>`,
    text: textParts.join("\n\n---\n\n"),
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function buildMaintenanceBodies(
  matches: MaintenanceMatch[],
): { html: string; text: string } {
  const intro =
    "These product pages returned HTTP 404 (maintenance). They may open for sale soon.";
  const htmlParts = matches.map((m) => {
    const labelLine = m.label
      ? `<p><strong>Label:</strong> ${escapeHtml(m.label)}</p>`
      : "";
    return `<section><p><strong>URL:</strong> <a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a></p>${labelLine}</section>`;
  });
  const textParts = matches.map((m) => {
    const labelLine = m.label ? `Label: ${m.label}\n` : "";
    return `${labelLine}URL: ${m.url}`;
  });
  return {
    html: `<div><p>${escapeHtml(intro)}</p>${htmlParts.join("<hr/>")}</div>`,
    text: `${intro}\n\n${textParts.join("\n\n---\n\n")}`,
  };
}

async function postResendEmail(
  config: AppConfig,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; error: string | null }> {
  const payload = {
    from: config.resendFrom,
    to: [config.alertEmail],
    subject,
    html,
    text,
  };

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { ok: true, error: null };
      }

      const body = await response.text();
      lastError = `Resend HTTP ${response.status}: ${body}`;

      if (!shouldRetry(response.status) || attempt === RETRY_DELAYS_MS.length) {
        return { ok: false, error: lastError };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === RETRY_DELAYS_MS.length) {
        return { ok: false, error: lastError };
      }
    }

    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }

  return { ok: false, error: lastError };
}

export async function sendAlertEmail(
  config: AppConfig,
  matches: AlertMatch[],
): Promise<{ ok: boolean; error: string | null }> {
  if (matches.length === 0) {
    return { ok: true, error: null };
  }

  const { html, text } = buildBodies(matches);
  const subject = `[在庫数] ${matches.length} page(s) matched`;
  return postResendEmail(config, subject, html, text);
}

export async function sendMaintenanceEmail(
  config: AppConfig,
  matches: MaintenanceMatch[],
): Promise<{ ok: boolean; error: string | null }> {
  if (matches.length === 0) {
    return { ok: true, error: null };
  }

  const { html, text } = buildMaintenanceBodies(matches);
  const subject =
    `[メンテナンス] ${matches.length} page(s) may open for sale soon`;
  return postResendEmail(config, subject, html, text);
}
