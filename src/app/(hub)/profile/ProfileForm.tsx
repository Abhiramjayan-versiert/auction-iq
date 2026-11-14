"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/types/db";

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [f, setF] = useState({ full_name: profile.full_name, phone: profile.phone ?? "", college: profile.college ?? "", city: profile.city ?? "", state: profile.state ?? "" });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabaseBrowser().from("profiles").update(f).eq("id", profile.id);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };
  return (
    <Card className="p-4">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(f) as (keyof typeof f)[]).map((k) => (
          <Field key={k} label={k.replace("_", " ")} className={k === "full_name" ? "sm:col-span-2" : ""}>
            <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <div className="sm:col-span-2 flex justify-between text-xs text-muted">
          <span>Role: {profile.platform_role.replace("_", " ")}</span>
          <Button>Save</Button>
        </div>
      </form>
    </Card>
  );
}
