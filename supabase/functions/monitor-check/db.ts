import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig, PageWatchState, UrlCheckResult, WatchStateUpdate } from "./types.ts";

export function createServiceClient(config: AppConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadEnabledPages(
  client: SupabaseClient,
): Promise<{ url: string; label: string | null }[]> {
  const { data, error } = await client
    .from("monitored_pages")
    .select("url, label")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`load monitored_pages: ${error.message}`);
  return data ?? [];
}

export async function getWatchState(
  client: SupabaseClient,
  url: string,
): Promise<PageWatchState | null> {
  const { data, error } = await client
    .from("page_watch_state")
    .select(
      "url, keyword_present, notified_while_present, last_h4_text, maintenance_404_present, notified_while_404",
    )
    .eq("url", url)
    .maybeSingle();

  if (error) throw new Error(`load page_watch_state: ${error.message}`);
  if (!data) return null;
  return {
    ...data,
    maintenance_404_present: data.maintenance_404_present ?? false,
    notified_while_404: data.notified_while_404 ?? false,
  };
}

export async function upsertWatchState(
  client: SupabaseClient,
  url: string,
  state: WatchStateUpdate,
): Promise<void> {
  const { error } = await client.from("page_watch_state").upsert({
    url,
    keyword_present: state.keyword_present,
    notified_while_present: state.notified_while_present,
    last_h4_text: state.last_h4_text,
    maintenance_404_present: state.maintenance_404_present,
    notified_while_404: state.notified_while_404,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`upsert page_watch_state: ${error.message}`);
}

export async function createCheckRun(
  client: SupabaseClient,
  urlsConfigured: number,
): Promise<string> {
  const { data, error } = await client
    .from("check_runs")
    .insert({
      status: "running",
      urls_configured: urlsConfigured,
      urls_alerted: 0,
      maintenance_urls_alerted: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`create check_run: ${error?.message ?? "no id"}`);
  }
  return data.id as string;
}

export async function insertCheckResult(
  client: SupabaseClient,
  runId: string,
  result: UrlCheckResult,
): Promise<void> {
  const { error } = await client.from("check_run_results").insert({
    run_id: runId,
    page_url: result.url,
    fetch_status: result.fetch_status,
    http_status: result.http_status,
    keyword_found: result.keyword_found,
    structure_ok: result.structure_ok,
    h4_text: result.h4_text,
    alert_eligible: result.alert_eligible,
    alert_sent: result.alert_sent,
    skip_reason: result.skip_reason,
    maintenance_detected: result.maintenance_detected,
    maintenance_eligible: result.maintenance_eligible,
    maintenance_sent: result.maintenance_sent,
    maintenance_skip_reason: result.maintenance_skip_reason,
  });

  if (error) throw new Error(`insert check_run_result: ${error.message}`);
}

export async function markResultsAlertSent(
  client: SupabaseClient,
  runId: string,
  urls: string[],
): Promise<void> {
  if (urls.length === 0) return;
  const { error } = await client
    .from("check_run_results")
    .update({ alert_sent: true })
    .eq("run_id", runId)
    .in("page_url", urls);

  if (error) throw new Error(`update alert_sent: ${error.message}`);
}

export async function markResultsMaintenanceSent(
  client: SupabaseClient,
  runId: string,
  urls: string[],
): Promise<void> {
  if (urls.length === 0) return;
  const { error } = await client
    .from("check_run_results")
    .update({ maintenance_sent: true })
    .eq("run_id", runId)
    .in("page_url", urls);

  if (error) throw new Error(`update maintenance_sent: ${error.message}`);
}

export async function completeCheckRun(
  client: SupabaseClient,
  runId: string,
  update: {
    status: "completed" | "failed";
    urls_alerted: number;
    email_status: string;
    maintenance_urls_alerted: number;
    maintenance_email_status: string;
    error_summary?: string | null;
  },
): Promise<void> {
  const { error } = await client
    .from("check_runs")
    .update({
      status: update.status,
      finished_at: new Date().toISOString(),
      urls_alerted: update.urls_alerted,
      email_status: update.email_status,
      maintenance_urls_alerted: update.maintenance_urls_alerted,
      maintenance_email_status: update.maintenance_email_status,
      error_summary: update.error_summary ?? null,
    })
    .eq("id", runId);

  if (error) throw new Error(`complete check_run: ${error.message}`);
}
