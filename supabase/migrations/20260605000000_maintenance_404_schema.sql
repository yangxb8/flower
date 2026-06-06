-- Maintenance 404 Alert schema (002-404-maintenance-alert)

ALTER TABLE public.page_watch_state
  ADD COLUMN IF NOT EXISTS maintenance_404_present boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_while_404 boolean NOT NULL DEFAULT false;

ALTER TABLE public.check_runs
  ADD COLUMN IF NOT EXISTS maintenance_urls_alerted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_email_status text;

ALTER TABLE public.check_run_results
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS maintenance_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_skip_reason text;
