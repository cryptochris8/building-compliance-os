/**
 * Sanitize error messages before returning to the client.
 * Strips database internals, stack traces, and sensitive information.
 */
export function sanitizeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;
  // Block messages that leak DB internals
  if (
    msg.includes('duplicate key') ||
    msg.includes('violates') ||
    msg.includes('relation "') ||
    msg.includes('column "') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('password authentication') ||
    msg.includes('SSL') ||
    msg.includes('timeout')
  ) {
    return fallback;
  }
  // Allow short, safe messages through
  if (msg.length > 200) return fallback;
  return msg;
}
