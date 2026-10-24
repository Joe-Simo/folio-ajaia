"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, FileText, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/brand";
export const DEMO_PASSWORD = "Folio-Review-2026!";
export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function authenticate(data: FormData) {
    setBusy(true);
    setError("");
    try {
      await signIn("password", data);
    } catch {
      setError(
        mode === "signUp"
          ? "Could not create this account. Use a valid email and a password with at least 8 characters, or sign in if you already have an account."
          : "Could not sign in. Check your email and password and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function demo(email: string) {
    const data = new FormData();
    data.set("flow", "signIn");
    data.set("email", email);
    data.set("password", DEMO_PASSWORD);
    void authenticate(data);
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <p className="small-kicker">LESS FRICTION. MORE THOUGHT.</p>
          <h1>
            Good ideas <br />
            need a little <br />
            <em>room.</em>
          </h1>
          <p>
            A quiet place to write things down. <br />A shared space to move
            them forward.
          </p>
        </div>
        <div className="auth-feature-row">
          <span>
            <FileText size={16} /> Make it yours
          </span>
          <span>
            <Users size={16} /> Bring people in
          </span>
        </div>
      </section>
      <section className="auth-form-section">
        <div className="auth-form">
          <p className="small-kicker">YOUR WORKSPACE</p>
          <h2>
            {mode === "signIn" ? "Welcome back." : "Start with a blank page."}
          </h2>
          <p className="auth-subtitle">
            {mode === "signIn"
              ? "Your documents, right where you left them."
              : "Write, save, and share in one thoughtful space."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              data.set("flow", mode);
              void authenticate(data);
            }}
          >
            {mode === "signUp" && (
              <div className="form-field">
                <label htmlFor="name">Your name</label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </div>
            )}
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                maxLength={254}
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signIn" ? "current-password" : "new-password"
                }
                required
                minLength={8}
              />
              {mode === "signUp" && <small>At least 8 characters.</small>}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button className="auth-submit" size="lg" disabled={busy}>
              {busy
                ? "Opening…"
                : mode === "signIn"
                  ? "Sign in"
                  : "Create account"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="auth-switch">
            {mode === "signIn" ? "New here?" : "Already have an account?"}{" "}
            <Button
              variant="link"
              disabled={busy}
              onClick={() => {
                setMode(mode === "signIn" ? "signUp" : "signIn");
                setError("");
              }}
            >
              {mode === "signIn" ? "Create an account" : "Sign in"}
            </Button>
          </p>
          <div className="demo-entry">
            <div>
              <span className="demo-title">Take a look around</span>
              <p>Two shared demo accounts. Please use example content.</p>
            </div>
            <div className="demo-buttons">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => demo("alex@folio.demo")}
              >
                Enter as Alex
                <ArrowRight size={14} />
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => demo("sam@folio.demo")}
              >
                Enter as Sam
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
          <p className="auth-footnote">
            <Check size={13} /> Automatically saved. Intentionally simple.
          </p>
        </div>
      </section>
    </main>
  );
}
