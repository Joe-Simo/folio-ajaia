import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Role = "owner" | "editor" | "viewer";
export type Ctx = QueryCtx | MutationCtx;

export async function requireUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId || !(await ctx.db.get(userId)))
    throw new ConvexError("Please sign in to continue.");
  return userId;
}

export async function access(
  ctx: Ctx,
  document: Doc<"documents">,
  userId: Id<"users">,
): Promise<Role | null> {
  if (document.ownerId === userId) return "owner";
  const share = await ctx.db
    .query("shares")
    .withIndex("by_documentId_and_userId", (q) =>
      q.eq("documentId", document._id).eq("userId", userId),
    )
    .unique();
  return share?.role ?? null;
}

export async function requireAccess(
  ctx: Ctx,
  id: Id<"documents">,
  mode: "read" | "write" | "owner",
) {
  const userId = await requireUser(ctx);
  const document = await ctx.db.get(id);
  const role = document ? await access(ctx, document, userId) : null;
  if (
    !document ||
    !role ||
    (mode === "owner" && role !== "owner") ||
    (mode === "write" && role === "viewer")
  ) {
    throw new ConvexError("You do not have access to do that.");
  }
  return { document, role, userId };
}

/** Read subscriptions become empty on revocation instead of throwing into the UI. */
export async function optionalReadAccess(ctx: Ctx, id: Id<"documents">) {
  const userId = await getAuthUserId(ctx);
  if (!userId || !(await ctx.db.get(userId))) return null;
  const document = await ctx.db.get(id);
  if (!document) return null;
  const role = await access(ctx, document, userId);
  return role ? { document, role, userId } : null;
}
