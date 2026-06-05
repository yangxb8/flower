import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Buffer } from "node:buffer";
import iconv from "npm:iconv-lite@0.6.3";
import {
  decodeHtmlBytes,
  detectHtmlCharset,
} from "../../supabase/functions/monitor-check/html-encoding.ts";
import { parseInventoryPage } from "../../supabase/functions/monitor-check/parse-inventory.ts";

const SAMPLE_UTF8 = `
<html><body>
  <div class="flr"><h4>残り8鉢です</h4></div>
  <table><tr><th>在庫数</th><td>残り8鉢です</td></tr></table>
</body></html>
`;

Deno.test("detectHtmlCharset - from Content-Type header", () => {
  const bytes = new TextEncoder().encode("<html></html>");
  assertEquals(
    detectHtmlCharset("text/html; charset=EUC-JP", bytes),
    "EUC-JP",
  );
});

Deno.test("decodeHtmlBytes - EUC-JP page finds 在庫数", () => {
  const eucBytes = iconv.encode(SAMPLE_UTF8, "euc-jp");
  const wrong = new TextDecoder("utf-8").decode(eucBytes);
  assertEquals(wrong.includes("在庫数"), false);

  const decoded = decodeHtmlBytes(new Uint8Array(eucBytes), "EUC-JP");
  assertEquals(decoded.includes("在庫数"), true);

  const parsed = parseInventoryPage(decoded);
  assertEquals(parsed.keywordFound, true);
  assertEquals(parsed.structureOk, true);
  assertEquals(parsed.h4Text, "残り8鉢です");
});
