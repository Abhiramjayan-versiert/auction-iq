"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GoogleButton } from "../register/GoogleButton";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message === "Email not confirmed" ? "Please verify your email first — check your inbox." : error.message);
    router.replace(next);
    router.refresh();
  };
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Log in to your auction workspace.</p>
      {params.get("verified") && <p className="mt-3 rounded-md border border-ok/40 bg-ok/10 p-2 text-xs text-ok">Email verified — you can log in now.</p>}
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Log in"}</Button>
      </form>
      <div className="my-4 text-center text-xs text-faint">or</div>
      <GoogleButton next={next} />
      <div className="mt-6 flex justify-between text-xs">
        <Link href="/forgot-password" className="text-muted hover:text-fg">Forgot password?</Link>
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-accent">Create account</Link>
      </div>
    </main>
  );
}
