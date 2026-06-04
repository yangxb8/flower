-- Website Keyword Monitor schema (001-website-keyword-monitor)

-- Operator-managed URL list (edit via Supabase Table Editor)
CREATE TABLE IF NOT EXISTS public.monitored_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-URL notification state (disappear → reappear dedup)
CREATE TABLE IF NOT EXISTS public.page_watch_state (
  url text PRIMARY KEY,
  keyword_present boolean NOT NULL DEFAULT false,
  notified_while_present boolean NOT NULL DEFAULT false,
  last_h4_text text,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per Edge Function invocation
CREATE TABLE IF NOT EXISTS public.check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  urls_configured integer NOT NULL DEFAULT 0,
  urls_alerted integer NOT NULL DEFAULT 0,
  email_status text,
  error_summary text,
  CONSTRAINT check_runs_status_check CHECK (status IN ('running', 'completed', 'failed'))
);

-- Per-URL outcome for a run
CREATE TABLE IF NOT EXISTS public.check_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.check_runs (id) ON DELETE CASCADE,
  page_url text NOT NULL,
  fetch_status text NOT NULL,
  keyword_found boolean NOT NULL DEFAULT false,
  structure_ok boolean NOT NULL DEFAULT false,
  h4_text text,
  alert_eligible boolean NOT NULL DEFAULT false,
  alert_sent boolean NOT NULL DEFAULT false,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_run_results_fetch_status_check CHECK (fetch_status IN ('ok', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_monitored_pages_enabled ON public.monitored_pages (enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_check_run_results_run_id ON public.check_run_results (run_id);
CREATE INDEX IF NOT EXISTS idx_check_run_results_page_url_created ON public.check_run_results (page_url, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_watch_state_last_checked ON public.page_watch_state (last_checked_at);

-- Seed initial OFG shop pages
INSERT INTO public.monitored_pages (url, label, enabled)
VALUES
  ('https://ofg-web-shop.com/?pid=176762784', 'OFG product 176762784', true),
  ('https://ofg-web-shop.com/?pid=165901954', 'OFG product 165901954', true)
ON CONFLICT (url) DO NOTHING;
