import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEnabledPages } from "./db.ts";
import type { MonitoredPage } from "./types.ts";

export async function loadMonitoredPages(
  client: SupabaseClient,
): Promise<MonitoredPage[]> {
  const rows = await loadEnabledPages(client);
  return rows.map((r) => ({ url: r.url.trim(), label: r.label }));
}
