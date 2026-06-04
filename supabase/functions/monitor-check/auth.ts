export function verifyMonitorSecret(
  req: Request,
  expectedSecret: string,
): boolean {
  const provided = req.headers.get("x-monitor-secret")?.trim();
  if (!provided || !expectedSecret) return false;
  if (provided.length !== expectedSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  return mismatch === 0;
}
