"use client";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";
import { APP_NAME } from "@/lib/format";
import { Button, Card, ErrorText, Field } from "./ui";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Can't reach the server. Check your connection.",
};

export function AuthForm() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signUp") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(MESSAGES[code] ?? (err as Error).message);
      setBusy(false);
    }
  }

  const signingUp = mode === "signUp";
  return (
    <Card className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="mt-1 text-sm text-muted">
        {signingUp ? "Create an account for your business." : "Sign in to your business ledger."}
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <Field label="Email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" required minLength={6}
          autoComplete={signingUp ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {signingUp ? "Already have an account?" : "New here?"}{" "}
        <button type="button" className="font-medium text-accent"
          onClick={() => { setMode(signingUp ? "signIn" : "signUp"); setError(""); }}>
          {signingUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </Card>
  );
}
