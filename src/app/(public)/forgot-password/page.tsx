"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) return toast.error(error.message);
    setSent(true);
  };
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Reset password</h1>
      {sent ? (
        <p className="mt-3 text-sm text-muted">If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button className="w-full">Send reset link</Button>
        </form>
      )}
    </main>
  );
}
