import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("users"), name: v.string(), email: v.string() }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name || user.email?.split("@")[0] || "Writer",
      email: user.email || "",
    };
  },
});

// Kept for compatibility with the starter's account menu during UI replacement.
export const viewer = current;
