/**
 * Makes an agent warning safe to show publicly: known secrets are removed and provider
 * error details (status lines, upstream messages) are cut, keeping the plain-language
 * part Sondo wrote. Warnings are stored in full in the private database.
 */
export function publicText(message: string, secrets: readonly string[] = [], max = 400): string {
  let m = message;
  for (const s of secrets) if (s) m = m.split(s).join("<redacted>");
  m = m.replace(/\((?:provider|no_output|budget|aborted):[^)]*\)/g, "(model error)");
  m = m.replace(/Provider error[^;.)]*/g, "provider error");
  return m.replace(/\s+/g, " ").trim().slice(0, max);
}
