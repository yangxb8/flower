import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseInventoryPage } from "../../supabase/functions/monitor-check/parse-inventory.ts";

Deno.test("parseInventoryPage - keyword absent", () => {
  const r = parseInventoryPage("<html><body>no match</body></html>");
  assertEquals(r.keywordFound, false);
  assertEquals(r.structureOk, false);
});

Deno.test("parseInventoryPage - keyword with flr h4", () => {
  const html = `
    <html><body>
      <p>在庫数</p>
      <div class="flr"><h4>残り 3 点</h4></div>
    </body></html>
  `;
  const r = parseInventoryPage(html);
  assertEquals(r.keywordFound, true);
  assertEquals(r.structureOk, true);
  assertEquals(r.h4Text, "残り 3 点");
});

Deno.test("parseInventoryPage - keyword without structure", () => {
  const html = "<html><body>在庫数 only</body></html>";
  const r = parseInventoryPage(html);
  assertEquals(r.keywordFound, true);
  assertEquals(r.structureOk, false);
});
