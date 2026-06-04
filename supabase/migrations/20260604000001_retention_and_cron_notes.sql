-- Retention: purge run history older than 30 days (run manually or via pg_cron)
-- Example pg_cron job (requires extension enabled on hosted Supabase):
--
-- SELECT cron.schedule(
--   'monitor-purge-old-runs',
--   '0 3 * * *',
--   $$DELETE FROM public.check_run_results
--     WHERE run_id IN (
--       SELECT id FROM public.check_runs WHERE started_at < now() - interval '30 days'
--     );
--     DELETE FROM public.check_runs WHERE started_at < now() - interval '30 days';$$
-- );
--
-- Cron invoke for monitor-check Edge Function (hosted):
-- Use Supabase Dashboard → Edge Functions → monitor-check → Schedules
-- Cron expression: 0 * * * * (hourly)
-- Add header: x-monitor-secret: <MONITOR_CRON_SECRET>

CREATE OR REPLACE FUNCTION public.purge_monitor_runs_older_than(days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_runs integer;
BEGIN
  DELETE FROM public.check_run_results
  WHERE run_id IN (
    SELECT id FROM public.check_runs
    WHERE started_at < now() - make_interval(days => days)
  );

  DELETE FROM public.check_runs
  WHERE started_at < now() - make_interval(days => days);

  GET DIAGNOSTICS deleted_runs = ROW_COUNT;
  RETURN deleted_runs;
END;
$$;

COMMENT ON FUNCTION public.purge_monitor_runs_older_than IS
  'Deletes check_runs and cascading check_run_results older than N days (default 30).';
