import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — German Doc Tracker" },
      { name: "description", content: "Admin access for managing German doc submission records." },
      { property: "og:title", content: "Admin Sign In — German Doc Tracker" },
      { property: "og:description", content: "Admin access for managing German doc submission records." },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back, Admin!");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Top German Flag Accent Strip */}
      <div className="h-1.5 w-full flex">
        <span className="flex-1 bg-zinc-950 dark:bg-zinc-800" />
        <span className="flex-1 bg-red-600" />
        <span className="flex-1 bg-amber-500" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-mono text-muted-foreground mb-3">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Authorized Admin Portal</span>
              </div>
              <h1 className="font-display text-3xl tracking-tight">Admin Sign In</h1>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Sign in with your registered admin credentials to manage doc rounds.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pw" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="pw"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl font-mono text-sm"
              />
            </div>

            <Button type="submit" disabled={busy} className="w-full h-11 rounded-xl gap-2 font-medium">
              {busy ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Sign In</span>
                </>
              )}
            </Button>

            <div className="pt-2 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to tracker</span>
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Subtle bottom note */}
      <footer className="py-4 text-center text-[11px] font-mono text-muted-foreground/60 border-t border-border/40">
        Germany Doc Tracker • Secure Administrator Access
      </footer>
    </div>
  );
}
