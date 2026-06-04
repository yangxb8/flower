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

  // Without a verified domain, Resend only allows onboarding@resend.dev as sender.
  // Omit RESEND_FROM to use that default; set RESEND_FROM after you verify a domain.
  const resendFrom = Deno.env.get("RESEND_FROM")?.trim() ||
    "Flower Monitor <onboarding@resend.dev>";

  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    alertEmail: requireEnv("ALERT_EMAIL"),
    resendApiKey: requireEnv("RESEND_API_KEY"),
    resendFrom,
    monitorCronSecret: requireEnv("MONITOR_CRON_SECRET"),
    fetchTimeoutMs,
  };
}
