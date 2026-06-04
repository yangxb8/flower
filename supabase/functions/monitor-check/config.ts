import type { AppConfig } from "./types.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const fetchTimeoutRaw = Deno.env.get("FETCH_TIMEOUT_MS");
  const fetchTimeoutMs = fetchTimeoutRaw
    ? Number.parseInt(fetchTimeoutRaw, 10)
    : 15_000;

  if (Number.isNaN(fetchTimeoutMs) || fetchTimeoutMs < 1000) {
    throw new Error("FETCH_TIMEOUT_MS must be an integer >= 1000");
  }

  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    alertEmail: requireEnv("ALERT_EMAIL"),
    resendApiKey: requireEnv("RESEND_API_KEY"),
    resendFrom: requireEnv("RESEND_FROM"),
    monitorCronSecret: requireEnv("MONITOR_CRON_SECRET"),
    fetchTimeoutMs,
  };
}
