import type { DedupInput, DedupOutput, ParseResult } from "./types.ts";

function isPresentWithStructure(parse: ParseResult): boolean {
  return parse.keywordFound && parse.structureOk && !!parse.h4Text;
}

/**
 * Disappear → reappear gate per URL (plan v1).
 * Email only when keyword+structure newly appears after absent episode.
 */
export function evaluateDedup(input: DedupInput): DedupOutput {
  const prevPresent = input.previous?.keyword_present ?? false;
  const prevNotified = input.previous?.notified_while_present ?? false;
  const nowPresent = isPresentWithStructure(input.parse);

  if (!nowPresent) {
    return {
      keywordPresent: false,
      notifiedWhilePresent: false,
      alertEligible: false,
      skipReason: input.parse.keywordFound && !input.parse.structureOk
        ? "missing_structure"
        : "keyword_absent",
      lastH4Text: input.previous?.last_h4_text ?? null,
    };
  }

  if (prevPresent && prevNotified) {
    return {
      keywordPresent: true,
      notifiedWhilePresent: true,
      alertEligible: false,
      skipReason: "already_notified",
      lastH4Text: input.parse.h4Text,
    };
  }

  return {
    keywordPresent: true,
    notifiedWhilePresent: false,
    alertEligible: true,
    skipReason: null,
    lastH4Text: input.parse.h4Text,
  };
}

/** State after successful email send */
export function stateAfterSuccessfulSend(
  dedup: DedupOutput,
): { keywordPresent: boolean; notifiedWhilePresent: boolean } {
  return {
    keywordPresent: dedup.keywordPresent,
    notifiedWhilePresent: dedup.keywordPresent,
  };
}
