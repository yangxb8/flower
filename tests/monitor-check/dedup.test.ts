import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateDedup } from "../../supabase/functions/monitor-check/dedup.ts";

const present = {
  keywordFound: true,
  structureOk: true,
  h4Text: "残り 3 点",
};

Deno.test("dedup - first appearance is eligible", () => {
  const r = evaluateDedup({ previous: null, parse: present });
  assertEquals(r.alertEligible, true);
  assertEquals(r.skipReason, null);
});

Deno.test("dedup - already notified while present", () => {
  const r = evaluateDedup({
    previous: {
      url: "https://example.com",
      keyword_present: true,
      notified_while_present: true,
      last_h4_text: "残り 3 点",
      maintenance_404_present: false,
      notified_while_404: false,
    },
    parse: present,
  });
  assertEquals(r.alertEligible, false);
  assertEquals(r.skipReason, "already_notified");
});

Deno.test("dedup - reappear after absent", () => {
  const r = evaluateDedup({
    previous: {
      url: "https://example.com",
      keyword_present: false,
      notified_while_present: false,
      last_h4_text: null,
      maintenance_404_present: false,
      notified_while_404: false,
    },
    parse: present,
  });
  assertEquals(r.alertEligible, true);
});

Deno.test("dedup - keyword disappeared resets state", () => {
  const r = evaluateDedup({
    previous: {
      url: "https://example.com",
      keyword_present: true,
      notified_while_present: true,
      last_h4_text: "x",
      maintenance_404_present: false,
      notified_while_404: false,
    },
    parse: { keywordFound: false, structureOk: false, h4Text: null },
  });
  assertEquals(r.keywordPresent, false);
  assertEquals(r.notifiedWhilePresent, false);
});
