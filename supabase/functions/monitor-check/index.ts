import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyMonitorSecret } from "./auth.ts";
import { loadConfig } from "./config.ts";
import {
  completeCheckRun,
  createCheckRun,
  createServiceClient,
  getWatchState,
  insertCheckResult,
  markResultsAlertSent,
  upsertWatchState,
} from "./db.ts";
import {
  evaluateDedup,
  stateAfterSuccessfulSend,
} from "./dedup.ts";
import { sendAlertEmail } from "./email.ts";
import { fetchPage } from "./fetch-page.ts";
import { loadMonitoredPages } from "./pages.ts";
import { parseInventoryPage } from "./parse-inventory.ts";
import type { AlertMatch, UrlCheckResult } from "./types.ts";

interface RequestBody {
  dry_run?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }

  if (!verifyMonitorSecret(req, config.monitorCronSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let dryRun = false;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as RequestBody;
      dryRun = body.dry_run === true;
    }
  } catch {
    /* empty body is fine */
  }

  const client = createServiceClient(config);
  const pages = await loadMonitoredPages(client);
  const runId = await createCheckRun(client, pages.length);

  const results: UrlCheckResult[] = [];
  const alertMatches: AlertMatch[] = [];
  const pendingStateUpdates: Array<{
    url: string;
    dedup: ReturnType<typeof evaluateDedup>;
  }> = [];

  for (const page of pages) {
    const fetchOutcome = await fetchPage(page.url, config.fetchTimeoutMs);

    if (!fetchOutcome.ok || !fetchOutcome.body) {
      const result: UrlCheckResult = {
        url: page.url,
        fetch_status: "error",
        keyword_found: false,
        structure_ok: false,
        h4_text: null,
        alert_eligible: false,
        alert_sent: false,
        skip_reason: "fetch_error",
      };
      results.push(result);
      await insertCheckResult(client, runId, result);
      continue;
    }

    const parse = parseInventoryPage(fetchOutcome.body);
    const previous = await getWatchState(client, page.url);
    const dedup = evaluateDedup({ previous, parse });

    const result: UrlCheckResult = {
      url: page.url,
      fetch_status: "ok",
      keyword_found: parse.keywordFound,
      structure_ok: parse.structureOk,
      h4_text: parse.h4Text,
      alert_eligible: dedup.alertEligible,
      alert_sent: false,
      skip_reason: dedup.skipReason,
    };

    if (dedup.alertEligible && parse.h4Text) {
      alertMatches.push({ url: page.url, h4_text: parse.h4Text });
      pendingStateUpdates.push({ url: page.url, dedup });
    } else if (!dryRun) {
      await upsertWatchState(client, page.url, {
        keyword_present: dedup.keywordPresent,
        notified_while_present: dedup.notifiedWhilePresent,
        last_h4_text: dedup.lastH4Text,
      });
    }

    results.push(result);
    await insertCheckResult(client, runId, result);
  }

  let emailStatus: "sent" | "skipped" | "failed" | "not_needed" = "not_needed";
  let urlsAlerted = 0;
  let errorSummary: string | null = null;

  if (alertMatches.length > 0) {
    if (dryRun) {
      emailStatus = "skipped";
    } else {
      const sendResult = await sendAlertEmail(config, alertMatches);
      if (sendResult.ok) {
        emailStatus = "sent";
        urlsAlerted = alertMatches.length;

        const alertedUrls = pendingStateUpdates.map((p) => p.url);
        await markResultsAlertSent(client, runId, alertedUrls);

        for (const { url, dedup } of pendingStateUpdates) {
          const afterSend = stateAfterSuccessfulSend(dedup);
          await upsertWatchState(client, url, {
            keyword_present: afterSend.keywordPresent,
            notified_while_present: afterSend.notifiedWhilePresent,
            last_h4_text: dedup.lastH4Text,
          });
        }

        for (const r of results) {
          if (r.alert_eligible) r.alert_sent = true;
        }
      } else {
        emailStatus = "failed";
        errorSummary = sendResult.error;
        /* Do not update notified_while_present — retry next run */
      }
    }
  }

  await completeCheckRun(client, runId, {
    status: "completed",
    urls_alerted: urlsAlerted,
    email_status: emailStatus,
    error_summary: errorSummary,
  });

  return jsonResponse({
    run_id: runId,
    status: "completed",
    urls_checked: pages.length,
    urls_alerted: urlsAlerted,
    email_status: emailStatus,
    dry_run: dryRun,
    results,
  });
});
