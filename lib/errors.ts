import { ConvexError } from "convex/values";

function data(error: unknown): unknown {
  return error instanceof ConvexError ? error.data : null;
}
export function isConflict(error: unknown): boolean {
  const value = data(error);
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "CONFLICT"
  );
}
/** Show intentional validation messages, never transport diagnostics or stacks. */
export function userMessage(error: unknown, fallback: string): string {
  const value = data(error);
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  )
    return value.message;
  if (error instanceof Error && !error.message.includes("[CONVEX"))
    return error.message;
  return fallback;
}
