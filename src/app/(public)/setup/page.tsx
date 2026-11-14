export default function Setup() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Connect Supabase to continue</h1>
      <p className="mt-3 text-sm text-muted">This deployment has no Supabase credentials yet. Set the following environment variables and apply the migrations in <code>supabase/migrations</code>:</p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface p-4 text-xs">{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server only>
NEXT_PUBLIC_SITE_URL=https://<your domain>`}</pre>
      <p className="mt-3 text-sm text-muted">See README.md for the full deployment guide.</p>
    </main>
  );
}
