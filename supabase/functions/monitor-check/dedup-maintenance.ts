import type { MaintenanceDedupInput, MaintenanceDedupOutput } from "./types.ts";

/**
 * Disappear → reappear gate per URL for HTTP 404 maintenance episodes.
 * Email only when URL newly enters 404 after not being in 404 (or after 2xx recovery).
 */
export function evaluateMaintenanceDedup(
  input: MaintenanceDedupInput,
): MaintenanceDedupOutput {
  const prev404 = input.previous?.maintenance_404_present ?? false;
  const prevNotified = input.previous?.notified_while_404 ?? false;

  if (input.recovered) {
    return {
      maintenance404Present: false,
      notifiedWhile404: false,
      maintenanceEligible: false,
      skipReason: null,
    };
  }

  if (!input.now404) {
    return {
      maintenance404Present: false,
      notifiedWhile404: false,
      maintenanceEligible: false,
      skipReason: "not_404",
    };
  }

  if (prev404 && prevNotified) {
    return {
      maintenance404Present: true,
      notifiedWhile404: true,
      maintenanceEligible: false,
      skipReason: "already_notified",
    };
  }

  return {
    maintenance404Present: true,
    notifiedWhile404: false,
    maintenanceEligible: true,
    skipReason: null,
  };
}

/** State after successful maintenance email send */
export function stateAfterSuccessfulMaintenanceSend(
  dedup: MaintenanceDedupOutput,
): { maintenance404Present: boolean; notifiedWhile404: boolean } {
  return {
    maintenance404Present: dedup.maintenance404Present,
    notifiedWhile404: dedup.maintenance404Present,
  };
}
