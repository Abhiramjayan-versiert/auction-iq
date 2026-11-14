"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GoogleButton } from "./GoogleButton";

const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Other"];

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{7,15}$/, "Enter a valid phone number").or(z.literal("")),
  college: z.string().trim().min(2, "Enter your college / institution"),
  city: z.string().trim().min(2, "Enter your city"),
  state: z.string().min(2, "Select your state"),
  requested_role: z.enum(["participant", "auctioneer"]),
});

export function RegisterForm() {
  const next = useSearchParams().get("next") || "/dashboard";
  const [f, setF] = useState({ full_name: "", email: "", password: "", phone: "", college: "", city: "", state: "", requested_role: "participant" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(f);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { password, email, ...meta } = parsed.data;
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { data: meta, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data.session) window.location.href = next;
    else setDone(true);
  };
  if (done)
    return (
      <main className="mx-auto max-w-sm px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">We sent a verification link to <b>{f.email}</b>. Verify your email, then log in.</p>
        {f.requested_role === "auctioneer" && <p className="mt-3 text-xs text-warn">Auctioneer access will be enabled after a Super Admin approves your request.</p>}
      </main>
    );
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">One account works for every auction you join.</p>
      <form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><Input required value={f.full_name} onChange={set("full_name")} autoComplete="name" /></Field>
        <Field label="Email"><Input type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></Field>
        <Field label="Password" hint="At least 8 characters"><Input type="password" required value={f.password} onChange={set("password")} autoComplete="new-password" /></Field>
        <Field label="Phone (optional)"><Input value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
        <Field label="College / institution"><Input required value={f.college} onChange={set("college")} /></Field>
        <Field label="City"><Input required value={f.city} onChange={set("city")} /></Field>
        <Field label="State">
          <Select required value={f.state} onChange={set("state")}>
            <option value="">Select…</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Account type" className="sm:col-span-2" hint="Auctioneer / event coordinator accounts require Super Admin approval.">
          <Select value={f.requested_role} onChange={set("requested_role")}>
            <option value="participant">Participant</option>
            <option value="auctioneer">Auctioneer / event coordinator</option>
          </Select>
        </Field>
        <Button className="sm:col-span-2" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
      </form>
      <div className="my-4 text-center text-xs text-faint">or</div>
      <GoogleButton next={next} />
      <p className="mt-6 text-center text-xs text-muted">Already registered? <Link href="/login" className="text-accent">Log in</Link></p>
    </main>
  );
}
