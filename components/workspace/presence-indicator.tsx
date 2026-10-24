"use client";

import usePresence from "@convex-dev/presence/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function PresenceIndicator({
  documentId,
  userId,
}: {
  documentId: Id<"documents">;
  userId: Id<"users">;
}) {
  const state = usePresence(api.presence, documentId, userId, 10_000);
  const online = state?.filter((person) => person.online) ?? [];
  const label =
    online.length === 1
      ? "Only you here"
      : online.length > 1
        ? `${online.length} people here`
        : "Connecting…";
  const names = online.map((person) => person.name || "Writer");

  return (
    <div
      className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground"
      role="status"
      aria-label={`${label}${names.length ? `: ${names.join(", ")}` : ""}`}
      title={names.join(", ")}
      data-testid="presence-indicator"
    >
      {online.length > 0 && (
        <div className="flex -space-x-1.5" aria-hidden="true">
          {online.slice(0, 3).map((person, index) => (
            <span
              key={person.userId}
              className={`grid h-6 w-6 place-items-center rounded-full border-2 border-background text-[8px] font-semibold ${index === 0 ? "bg-[#efd8c6] text-[#754528]" : index === 1 ? "bg-[#dbe5d7] text-[#4b6441]" : "bg-[#e3dde8] text-[#655071]"}`}
            >
              {initials(person.name || "Writer")}
            </span>
          ))}
          {online.length > 3 && (
            <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-background bg-secondary text-[8px] font-semibold">
              +{online.length - 3}
            </span>
          )}
        </div>
      )}
      <span className="hidden sm:inline">{label}</span>
      <span
        className={`h-1.5 w-1.5 rounded-full ${online.length ? "bg-[#78906d]" : "bg-[#b7b0a7]"}`}
        aria-hidden="true"
      />
    </div>
  );
}
