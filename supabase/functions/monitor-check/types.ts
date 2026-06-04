export const KEYWORD = "在庫数";

export interface AppConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  alertEmail: string;
  resendApiKey: string;
  resendFrom: string;
  monitorCronSecret: string;
  fetchTimeoutMs: number;
}

export interface MonitoredPage {
  url: string;
  label: string | null;
}

export interface PageWatchState {
  url: string;
  keyword_present: boolean;
  notified_while_present: boolean;
  last_h4_text: string | null;
}

export interface ParseResult {
  keywordFound: boolean;
  structureOk: boolean;
  h4Text: string | null;
}

export interface DedupInput {
  previous: PageWatchState | null;
  parse: ParseResult;
}

export interface DedupOutput {
  keywordPresent: boolean;
  notifiedWhilePresent: boolean;
  alertEligible: boolean;
  skipReason: string | null;
  lastH4Text: string | null;
}

export interface UrlCheckResult {
  url: string;
  fetch_status: "ok" | "error";
  keyword_found: boolean;
  structure_ok: boolean;
  h4_text: string | null;
  alert_eligible: boolean;
  alert_sent: boolean;
  skip_reason: string | null;
}

export interface AlertMatch {
  url: string;
  h4_text: string;
}
