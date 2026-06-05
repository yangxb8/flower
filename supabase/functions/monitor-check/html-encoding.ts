import { Buffer } from "node:buffer";
import iconv from "iconv-lite";

/** Read charset from Content-Type header or <meta charset> in the first 8KB. */
export function detectHtmlCharset(
  contentType: string | null,
  bytes: Uint8Array,
): string {
  const fromHeader = contentType?.match(/charset=([^;\s"'`]+)/i)?.[1];
  if (fromHeader) return fromHeader.replace(/['"]/g, "");

  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8192));
  const meta = head.match(
    /<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9._-]+)/i,
  );
  return meta?.[1] ?? "utf-8";
}

/** Decode raw HTML bytes using UTF-8 or legacy Japanese encodings (e.g. EUC-JP). */
export function decodeHtmlBytes(bytes: Uint8Array, charset: string): string {
  const norm = charset.trim().toLowerCase().replace(/_/g, "-");
  if (norm === "utf-8" || norm === "utf8") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  return iconv.decode(Buffer.from(bytes), norm);
}

export async function decodeHtmlResponse(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const charset = detectHtmlCharset(
    response.headers.get("content-type"),
    bytes,
  );
  return decodeHtmlBytes(bytes, charset);
}
