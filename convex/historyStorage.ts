import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { EMPTY_CONTENT } from "./documentValidation";

export const MAX_VERSIONS = 50;

/** Saves the prior state in the same transaction as an edit or restore. */
export async function snapshotDocument(
  ctx: MutationCtx,
  document: Doc<"documents">,
) {
  const current = await ctx.db
    .query("documentBodies")
    .withIndex("by_documentId", (q) => q.eq("documentId", document._id))
    .unique();
  const bodyId = await ctx.db.insert("versionBodies", {
    documentId: document._id,
    content: current?.content ?? document.content ?? EMPTY_CONTENT,
  });
  await ctx.db.insert("versions", {
    documentId: document._id,
    revision: document.revision,
    title: document.title,
    createdAt: document.updatedAt,
    ...(document.updatedBy ? { authorId: document.updatedBy } : {}),
    bodyId,
  });
  const versions = await ctx.db
    .query("versions")
    .withIndex("by_documentId", (q) => q.eq("documentId", document._id))
    .order("desc")
    .take(MAX_VERSIONS + 1);
  for (const obsolete of versions.slice(MAX_VERSIONS)) {
    await ctx.db.delete(obsolete.bodyId);
    await ctx.db.delete(obsolete._id);
  }
}

export async function deleteDocumentHistory(
  ctx: MutationCtx,
  id: Id<"documents">,
) {
  const versions = await ctx.db
    .query("versions")
    .withIndex("by_documentId", (q) => q.eq("documentId", id))
    .take(MAX_VERSIONS);
  for (const version of versions) {
    await ctx.db.delete(version.bodyId);
    await ctx.db.delete(version._id);
  }
}
