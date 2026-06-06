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
  markResultsMaintenanceSent,
  upsertWatchState,
} from "./db.ts";
import {
  evaluateMaintenanceDedup,
  stateAfterSuccessfulMaintenanceSend,
} from "./dedup-maintenance.ts";
import {
  evaluateDedup,
  stateAfterSuccessfulSend,
} from "./dedup.ts";
import { sendAlertEmail, sendMaintenanceEmail } from "./email.ts";
import { fetchPage } from "./fetch-page.ts";
import { loadMonitoredPages } from "./pages.ts";
import { parseInventoryPage } from "./parse-inventory.ts";
import type {
  AlertMatch,
  MaintenanceDedupOutput,
  MaintenanceMatch,
  PageWatchState,
  UrlCheckResult,
  WatchStateUpdate,
} from "./types.ts";

interface RequestBody {
  dry_run?: boolean;
}

type EmailStatus = "sent" | "skipped" | "failed" | "not_needed";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function inventoryFieldsFromPrevious(
  previous: PageWatchState | null,
): Pick<
  WatchStateUpdate,
  "keyword_present" | "notified_while_present" | "last_h4_text"
> {
  return {
    keyword_present: previous?.keyword_present ?? false,
    notified_while_present: previous?.notified_while_present ?? false,
    last_h4_text: previous?.last_h4_text ?? null,
  };
}

function emptyMaintenanceResult(): Pick<
  UrlCheckResult,
  | "maintenance_detected"
  | "maintenance_eligible"
  | "maintenance_sent"
  | "maintenance_skip_reason"
> {
  return {
    maintenance_detected: false,
    maintenance_eligible: false,
    maintenance_sent: false,
    maintenance_skip_reason: null,
  };
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
  const maintenanceMatches: MaintenanceMatch[] = [];
  const pendingInventoryUpdates: Array<{
    url: string;
    dedup: ReturnType<typeof evaluateDedup>;
    previous: PageWatchState | null;
    maintDedup: MaintenanceDedupOutput;
  }> = [];
  const pendingMaintenanceUpdates: Array<{
    url: string;
    dedup: MaintenanceDedupOutput;
    previous: PageWatchState | null;
  }> = [];

  for (const page of pages) {
    const fetchOutcome = await fetchPage(page.url, config.fetchTimeoutMs);
    const previous = await getWatchState(client, page.url);

    if (fetchOutcome.status === 404) {
      const maintDedup = evaluateMaintenanceDedup({
        previous,
        now404: true,
        recovered: false,
      });

      const result: UrlCheckResult = {
        url: page.url,
        fetch_status: "error",
        http_status: 404,
        keyword_found: false,
        structure_ok: false,
        h4_text: null,
        alert_eligible: false,
        alert_sent: false,
        skip_reason: null,
        maintenance_detected: true,
        maintenance_eligible: maintDedup.maintenanceEligible,
        maintenance_sent: false,
        maintenance_skip_reason: maintDedup.skipReason,
      };

      if (maintDedup.maintenanceEligible) {
        maintenanceMatches.push({ url: page.url, label: page.label });
        pendingMaintenanceUpdates.push({ url: page.url, dedup: maintDedup, previous });
      } else if (!dryRun) {
        await upsertWatchState(client, page.url, {
          ...inventoryFieldsFromPrevious(previous),
          maintenance_404_present: maintDedup.maintenance404Present,
          notified_while_404: maintDedup.notifiedWhile404,
        });
      }

      results.push(result);
      await insertCheckResult(client, runId, result);
      continue;
    }

    if (!fetchOutcome.ok || !fetchOutcome.body) {
      const result: UrlCheckResult = {
        url: page.url,
        fetch_status: "error",
        http_status: fetchOutcome.status,
        keyword_found: false,
        structure_ok: false,
        h4_text: null,
        alert_eligible: false,
        alert_sent: false,
        skip_reason: "fetch_error",
        maintenance_detected: false,
        maintenance_eligible: false,
        maintenance_sent: false,
        maintenance_skip_reason: "fetch_error",
      };
      results.push(result);
      await insertCheckResult(client, runId, result);
      continue;
    }

    const maintDedup = evaluateMaintenanceDedup({
      previous,
      now404: false,
      recovered: true,
    });

    const parse = parseInventoryPage(fetchOutcome.body);
    const dedup = evaluateDedup({ previous, parse });

    const result: UrlCheckResult = {
      url: page.url,
      fetch_status: "ok",
      http_status: fetchOutcome.status,
      keyword_found: parse.keywordFound,
      structure_ok: parse.structureOk,
      h4_text: parse.h4Text,
      alert_eligible: dedup.alertEligible,
      alert_sent: false,
      skip_reason: dedup.skipReason,
      ...emptyMaintenanceResult(),
      maintenance_skip_reason: maintDedup.skipReason,
    };

    if (dedup.alertEligible && parse.h4Text) {
      alertMatches.push({ url: page.url, h4_text: parse.h4Text });
      pendingInventoryUpdates.push({ url: page.url, dedup, previous, maintDedup });
    } else if (!dryRun) {
      await upsertWatchState(client, page.url, {
        keyword_present: dedup.keywordPresent,
        notified_while_present: dedup.notifiedWhilePresent,
        last_h4_text: dedup.lastH4Text,
        maintenance_404_present: maintDedup.maintenance404Present,
        notified_while_404: maintDedup.notifiedWhile404,
      });
    }

    results.push(result);
    await insertCheckResult(client, runId, result);
  }

  let maintenanceEmailStatus: EmailStatus = "not_needed";
  let maintenanceUrlsAlerted = 0;
  let emailStatus: EmailStatus = "not_needed";
  let urlsAlerted = 0;
  const errors: string[] = [];

  if (maintenanceMatches.length > 0) {
    if (dryRun) {
      maintenanceEmailStatus = "skipped";
    } else {
      const sendResult = await sendMaintenanceEmail(config, maintenanceMatches);
      if (sendResult.ok) {
        maintenanceEmailStatus = "sent";
        maintenanceUrlsAlerted = maintenanceMatches.length;

        const alertedUrls = pendingMaintenanceUpdates.map((p) => p.url);
        await markResultsMaintenanceSent(client, runId, alertedUrls);

        for (const { url, dedup, previous } of pendingMaintenanceUpdates) {
          const afterSend = stateAfterSuccessfulMaintenanceSend(dedup);
          await upsertWatchState(client, url, {
            ...inventoryFieldsFromPrevious(previous),
            maintenance_404_present: afterSend.maintenance404Present,
            notified_while_404: afterSend.notifiedWhile404,
          });
        }

        for (const r of results) {
          if (r.maintenance_eligible) r.maintenance_sent = true;
        }
      } else {
        maintenanceEmailStatus = "failed";
        if (sendResult.error) errors.push(sendResult.error);
      }
    }
  }

  if (alertMatches.length > 0) {
    if (dryRun) {
      emailStatus = "skipped";
    } else {
      const sendResult = await sendAlertEmail(config, alertMatches);
      if (sendResult.ok) {
        emailStatus = "sent";
        urlsAlerted = alertMatches.length;

        const alertedUrls = pendingInventoryUpdates.map((p) => p.url);
        await markResultsAlertSent(client, runId, alertedUrls);

        for (const { url, dedup, previous, maintDedup } of pendingInventoryUpdates) {
          const afterSend = stateAfterSuccessfulSend(dedup);
          await upsertWatchState(client, url, {
            keyword_present: afterSend.keywordPresent,
            notified_while_present: afterSend.notifiedWhilePresent,
            last_h4_text: dedup.lastH4Text,
            maintenance_404_present: maintDedup.maintenance404Present,
            notified_while_404: maintDedup.notifiedWhile404,
          });
        }

        for (const r of results) {
          if (r.alert_eligible) r.alert_sent = true;
        }
      } else {
        emailStatus = "failed";
        if (sendResult.error) errors.push(sendResult.error);
      }
    }
  }

  const errorSummary = errors.length > 0 ? errors.join("; ") : null;

  await completeCheckRun(client, runId, {
    status: "completed",
    urls_alerted: urlsAlerted,
    email_status: emailStatus,
    maintenance_urls_alerted: maintenanceUrlsAlerted,
    maintenance_email_status: maintenanceEmailStatus,
    error_summary: errorSummary,
  });

  return jsonResponse({
    run_id: runId,
    status: "completed",
    urls_checked: pages.length,
    urls_alerted: urlsAlerted,
    email_status: emailStatus,
    maintenance_urls_alerted: maintenanceUrlsAlerted,
    maintenance_email_status: maintenanceEmailStatus,
    dry_run: dryRun,
    results,
  });
});
