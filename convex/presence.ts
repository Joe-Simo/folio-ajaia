import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { access, optionalReadAccess } from "./documentAccess";
import type { Ctx } from "./documentAccess";
import type { Id } from "./_generated/dataModel";

const presence = new Presence<Id<"documents">, Id<"users">>(
  components.presence,
);

async function currentAccess(ctx: Ctx, id: Id<"documents">) {
  try {
    return await optionalReadAccess(ctx, id);
  } catch (error) {
    if (error instanceof ConvexError) return null;
    throw error;
  }
}

/** The client supplies identifiers, but the server owns identity and room access. */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("documents", args.roomId);
    if (!id) return { roomToken: "", sessionToken: "" };
    const authorized = await currentAccess(ctx, id);
    // The component hook may finish an in-flight tick during revocation/logout.
    // Empty tokens end its subscription without exposing a room or throwing.
    if (!authorized) return { roomToken: "", sessionToken: "" };
    const { userId } = authorized;
    if (args.userId !== userId)
      throw new ConvexError("Presence identity does not match your account.");
    if (
      !args.sessionId ||
      args.sessionId.length > 512 ||
      !Number.isFinite(args.interval) ||
      args.interval < 3_000 ||
      args.interval > 60_000
    ) {
      throw new ConvexError("Invalid presence session.");
    }
    const tokens = await presence.heartbeat(
      ctx,
      id,
      userId,
      `${id}:${userId}:${args.sessionId}`,
      args.interval,
    );
    // A document ID is not a bearer credential: list checks current access again.
    // Never expose the component's persistent bearer room token to clients.
    return { roomToken: id, sessionToken: tokens.sessionToken };
  },
});

export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(
    v.object({
      userId: v.string(),
      online: v.boolean(),
      lastDisconnected: v.number(),
      name: v.string(),
    }),
  ),
  handler: async (ctx, { roomToken }) => {
    const id = ctx.db.normalizeId("documents", roomToken);
    if (!id) return [];
    const authorized = await currentAccess(ctx, id);
    if (!authorized) return [];
    const { document } = authorized;
    const online = await presence.listRoom(ctx, id, true, 101);
    const visible: Array<{
      userId: Id<"users">;
      online: boolean;
      lastDisconnected: number;
      name: string;
    }> = [];
    for (const member of online) {
      const userId = ctx.db.normalizeId("users", member.userId);
      if (!userId) continue;
      const user = await ctx.db.get(userId);
      // Revoked/deleted users disappear immediately, before the heartbeat timeout.
      if (!user || !(await access(ctx, document, userId))) continue;
      visible.push({
        userId,
        online: true,
        lastDisconnected: member.lastDisconnected,
        name: user.name || user.email?.split("@")[0] || "Writer",
      });
    }
    return visible;
  },
});

/** sendBeacon has no auth header; this opaque token can only end its own session. */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    if (!sessionToken || sessionToken.length > 256) return null;
    return await presence.disconnect(ctx, sessionToken);
  },
});
