"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState("");
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
