"use client";
import { useConvexAuth } from "convex/react";
import { AuthScreen } from "@/components/auth-screen";
import { Workspace } from "@/components/workspace/workspace";
export default function Home() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading)
    return (
      <div className="app-loading">
        <span className="brand-word">Folio</span>
        <p>Opening your workspace…</p>
      </div>
    );
  return isAuthenticated ? <Workspace /> : <AuthScreen />;
}
