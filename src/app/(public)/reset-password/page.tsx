"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  useEffect(() => {
    // Admin-initiated recovery links arrive with tokens in the URL hash (implicit flow).
    const h = new URLSearchParams(window.location.hash.slice(1));
    const access_token = h.get("access_token");
    const refresh_token = h.get("refresh_token");
    if (access_token && refresh_token) {
      void supabaseBrowser().auth.setSession({ access_token, refresh_token }).then(() => history.replaceState(null, "", "/reset-password"));
    }
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    router.replace("/dashboard");
  };
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Field label="New password"><Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Button className="w-full">Update password</Button>
      </form>
    </main>
  );
}
