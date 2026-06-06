import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateMaintenanceDedup } from "../../supabase/functions/monitor-check/dedup-maintenance.ts";
import type { PageWatchState } from "../../supabase/functions/monitor-check/types.ts";

const baseState: PageWatchState = {
  url: "https://example.com/p",
  keyword_present: false,
  notified_while_present: false,
  last_h4_text: null,
  maintenance_404_present: false,
  notified_while_404: false,
};

Deno.test("evaluateMaintenanceDedup - newly enters 404", () => {
  const r = evaluateMaintenanceDedup({
    previous: null,
    now404: true,
    recovered: false,
  });
  assertEquals(r.maintenanceEligible, true);
  assertEquals(r.maintenance404Present, true);
  assertEquals(r.notifiedWhile404, false);
});

Deno.test("evaluateMaintenanceDedup - already_notified while still 404", () => {
  const previous: PageWatchState = {
    ...baseState,
    maintenance_404_present: true,
    notified_while_404: true,
  };
  const r = evaluateMaintenanceDedup({
    previous,
    now404: true,
    recovered: false,
  });
  assertEquals(r.maintenanceEligible, false);
  assertEquals(r.skipReason, "already_notified");
});

Deno.test("evaluateMaintenanceDedup - recovery on 2xx", () => {
  const previous: PageWatchState = {
    ...baseState,
    maintenance_404_present: true,
    notified_while_404: true,
  };
  const r = evaluateMaintenanceDedup({
    previous,
    now404: false,
    recovered: true,
  });
  assertEquals(r.maintenance404Present, false);
  assertEquals(r.notifiedWhile404, false);
  assertEquals(r.maintenanceEligible, false);
});

Deno.test("evaluateMaintenanceDedup - re-enter 404 after recovery", () => {
  const previous: PageWatchState = {
    ...baseState,
    maintenance_404_present: false,
    notified_while_404: false,
  };
  const r = evaluateMaintenanceDedup({
    previous,
    now404: true,
    recovered: false,
  });
  assertEquals(r.maintenanceEligible, true);
});
