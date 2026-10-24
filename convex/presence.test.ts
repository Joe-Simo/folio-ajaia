/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import presenceTest from "@convex-dev/presence/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  const ids = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@presence.test",
    }),
    viewer: await ctx.db.insert("users", {
      name: "Viewer",
      email: "viewer@presence.test",
    }),
    stranger: await ctx.db.insert("users", {
      name: "Stranger",
      email: "stranger@presence.test",
    }),
  }));
  const owner = t.withIdentity({ subject: ids.owner });
  const viewer = t.withIdentity({ subject: ids.viewer });
  const stranger = t.withIdentity({ subject: ids.stranger });
  const id = await owner.mutation(api.documents.create, {
    title: "Presence test",
  });
  await owner.mutation(api.documents.share, {
    id,
    email: "viewer@presence.test",
    role: "viewer",
  });
  return { t, ids, owner, viewer, stranger, id };
}

describe("document presence authorization", () => {
  test("tracks real document participants while rejecting identity and room spoofing", async () => {
    const { ids, owner, viewer, stranger, id } = await setup();
    const first = await owner.mutation(api.presence.heartbeat, {
      roomId: id,
      userId: ids.owner,
      sessionId: "owner-session",
      interval: 10000,
    });
    await viewer.mutation(api.presence.heartbeat, {
      roomId: id,
      userId: ids.viewer,
      sessionId: "viewer-session",
      interval: 10000,
    });
    expect(first.roomToken).toBe(id);
    expect(
      (await owner.query(api.presence.list, { roomToken: first.roomToken }))
        .map((person) => person.name)
        .sort(),
    ).toEqual(["Owner", "Viewer"]);
    await expect(
      stranger.mutation(api.presence.heartbeat, {
        roomId: id,
        userId: ids.stranger,
        sessionId: "stranger-session",
        interval: 10000,
      }),
    ).resolves.toEqual({ roomToken: "", sessionToken: "" });
    await expect(
      owner.mutation(api.presence.heartbeat, {
        roomId: id,
        userId: ids.viewer,
        sessionId: "spoofed-session",
        interval: 10000,
      }),
    ).rejects.toThrow("identity");
    expect(
      await stranger.query(api.presence.list, { roomToken: first.roomToken }),
    ).toEqual([]);
  });

  test("revocation removes visibility even when an old room token is retained", async () => {
    const { ids, owner, viewer, id } = await setup();
    const token = await viewer.mutation(api.presence.heartbeat, {
      roomId: id,
      userId: ids.viewer,
      sessionId: "viewer-session",
      interval: 10000,
    });
    await owner.mutation(api.documents.revoke, { id, userId: ids.viewer });
    expect(
      await viewer.query(api.presence.list, { roomToken: token.roomToken }),
    ).toEqual([]);
    expect(await owner.query(api.presence.list, { roomToken: id })).toEqual([]);
  });

  test("an opaque session token can disconnect without opening room reads", async () => {
    const { t, ids, owner, id } = await setup();
    const token = await owner.mutation(api.presence.heartbeat, {
      roomId: id,
      userId: ids.owner,
      sessionId: "owner-session",
      interval: 10000,
    });
    expect(
      await owner.query(api.presence.list, { roomToken: id }),
    ).toHaveLength(1);
    await t.mutation(api.presence.disconnect, {
      sessionToken: token.sessionToken,
    });
    expect(await owner.query(api.presence.list, { roomToken: id })).toEqual([]);
    expect(await t.query(api.presence.list, { roomToken: id })).toEqual([]);
  });
});
