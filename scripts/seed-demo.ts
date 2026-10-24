/** Creates only the two public reviewer accounts and their clearly marked example documents. */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
const url = process.argv[2];
if (!url || !/^https:\/\/[^/]+\.convex\.cloud$/.test(url))
  throw new Error(
    "Usage: bun scripts/seed-demo.ts https://YOUR-DEPLOYMENT.convex.cloud",
  );
const password = "Folio-Review-2026!";
async function account(email: string, name: string) {
  const client = new ConvexHttpClient(url);
  let result;
  try {
    result = await client.action(api.auth.signIn, {
      provider: "password",
      params: { email, password, flow: "signIn" },
    });
  } catch {
    result = await client.action(api.auth.signIn, {
      provider: "password",
      params: { email, password, name, flow: "signUp" },
    });
  }
  if (!result.tokens) throw new Error("Could not establish reviewer session");
  client.setAuth(result.tokens.token);
  return client;
}
const alex = await account("alex@folio.demo", "Alex Morgan");
const sam = await account("sam@folio.demo", "Sam Rivera");
const text = (value: string) => ({ type: "text", text: value });
const p = (value: string) => ({ type: "paragraph", content: [text(value)] });
const h = (value: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(value)],
});
const body = JSON.stringify({
  type: "doc",
  content: [
    h("Start with clarity"),
    p(
      "We give every idea room to grow, and we keep decisions close to the work. By writing together, we move from scattered thoughts to shared understanding.",
    ),
    h("What matters most"),
    {
      type: "bulletList",
      content: [
        "Make the next step obvious.",
        "Build trust through thoughtful details.",
        "Leave room for better ideas.",
      ].map((value) => ({ type: "listItem", content: [p(value)] })),
    },
    p(
      "This is an example document in the public reviewer workspace. Try formatting a sentence, then open Share to change Sam’s access.",
    ),
  ],
});
const existing = await alex.query(api.documents.list, {});
const main = existing.documents.find((d) => d.title === "A better way to work");
const id = main
  ? main._id
  : await alex.mutation(api.documents.create, {
      title: "A better way to work",
      content: body,
    });
await alex.mutation(api.documents.share, {
  id,
  email: "sam@folio.demo",
  role: "editor",
});
if (!existing.documents.some((d) => d.title === "Product principles"))
  await alex.mutation(api.documents.create, {
    title: "Product principles",
    content: JSON.stringify({
      type: "doc",
      content: [
        h("Simple is thoughtful"),
        p(
          "Begin with the purpose. Keep the next step clear. Give useful details their place, and remove what gets in the way.",
        ),
        p("This example is private to Alex until Alex shares it."),
      ],
    }),
  });
const shared = await sam.query(api.documents.list, {});
if (!shared.documents.some((d) => d.title === "Research notes")) {
  const notes = await sam.mutation(api.documents.create, {
    title: "Research notes",
    content: JSON.stringify({
      type: "doc",
      content: [
        h("Questions before answers"),
        p(
          "What are we trying to make easier? Who needs it most? What would a useful first version let them do?",
        ),
        p("This example belongs to Sam and is shared with Alex as a viewer."),
      ],
    }),
  });
  await sam.mutation(api.documents.share, {
    id: notes,
    email: "alex@folio.demo",
    role: "viewer",
  });
}
console.log(
  "Public reviewer accounts ready: Alex (owner/editor) and Sam (editor/owner). No private credentials printed.",
);
