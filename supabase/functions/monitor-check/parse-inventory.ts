import { parseHTML } from "linkedom";
import { KEYWORD, type ParseResult } from "./types.ts";

export function parseInventoryPage(html: string): ParseResult {
  const keywordFound = html.includes(KEYWORD);
  if (!keywordFound) {
    return { keywordFound: false, structureOk: false, h4Text: null };
  }

  const { document } = parseHTML(html);
  const flrDivs = document.querySelectorAll("div.flr");
  const h4Texts: string[] = [];

  for (const div of flrDivs) {
    const h4s = div.querySelectorAll("h4");
    for (const h4 of h4s) {
      const text = (h4.textContent ?? "").trim();
      if (text) h4Texts.push(text);
    }
  }

  if (h4Texts.length === 0) {
    return { keywordFound: true, structureOk: false, h4Text: null };
  }

  const h4Text = h4Texts.length === 1
    ? h4Texts[0]
    : h4Texts.map((t, i) => `[${i + 1}] ${t}`).join("\n");

  return { keywordFound: true, structureOk: true, h4Text };
}
