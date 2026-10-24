import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  documents: defineTable({
    ownerId: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    title: v.string(),
    content: v.optional(v.string()),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]),
  documentBodies: defineTable({
    documentId: v.id("documents"),
    content: v.string(),
  }).index("by_documentId", ["documentId"]),
  shares: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    role: v.union(v.literal("viewer"), v.literal("editor")),
  })
    .index("by_documentId_and_userId", ["documentId", "userId"])
    .index("by_userId", ["userId"]),
  comments: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    resolved: v.boolean(),
  }).index("by_documentId", ["documentId"]),
  versions: defineTable({
    documentId: v.id("documents"),
    revision: v.number(),
    title: v.string(),
    createdAt: v.number(),
    authorId: v.optional(v.id("users")),
    bodyId: v.id("versionBodies"),
  }).index("by_documentId", ["documentId"]),
  versionBodies: defineTable({
    documentId: v.id("documents"),
    content: v.string(),
  }).index("by_documentId", ["documentId"]),
});
