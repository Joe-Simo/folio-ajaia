import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email =
          typeof params.email === "string"
            ? params.email.trim().toLowerCase()
            : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
          throw new ConvexError("Enter a valid email address.");
        }
        const name =
          typeof params.name === "string"
            ? params.name.trim().slice(0, 80)
            : "";
        return { email, name: name || email.split("@")[0] };
      },
    }),
  ],
});
