import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  type Batch, forecast, toDate, daysBetween, fmtMonth, fmtDate,
} from "@/lib/forecast";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "German Doc Tracker — Masters BD" },
      { name: "description", content: "Track German doc submission mail rounds for Masters BD and see an 8-month projection." },
      { property: "og:title", content: "German Doc Tracker — Masters BD" },
      { property: "og:description", content: "Past doc mail rounds and next 8-month projection for Masters BD applicants." },
    ],
  }),
  component: Index,
});

type Form = { id?: string; mail_month: string; coverage_start: string; coverage_end: string; people_count: string; notes: string };
const empty: Form = { mail_month: "", coverage_start: "", coverage_end: "", people_count: "", notes: "" };

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      setEmail(u?.email ?? null);
      if (!u) return setIsAdmin(false);
      const { data: r } = await supabase.rpc("has_role", { _user_id: u.id, _role: "admin" });
      setIsAdmin(!!r);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") check();
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { isAdmin, email };
}

function Index() {
  const qc = useQueryClient();
  const { isAdmin, email } = useIsAdmin();
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doc_batches").select("*").order("mail_month", { ascending: false });
      if (error) throw error;
      return data as Batch[];
    },
  });
  const predictions = useMemo(() => forecast(batches), [batches]);
  const [form, setForm] = useState<Form | null>(null);

  async function save() {
    if (!form) return;
    const row = {
      mail_month: form.mail_month.length === 7 ? form.mail_month + "-01" : form.mail_month,
      coverage_start: form.coverage_start,
      coverage_end: form.coverage_end,
      people_count: Number(form.people_count) || 0,
      notes: form.notes || null,
    };
    if (!row.mail_month || !row.coverage_start || !row.coverage_end) { toast.error("Fill in all dates"); return; }
    if (row.coverage_end < row.coverage_start) { toast.error("Coverage end must be after start"); return; }
    const { error } = form.id
      ? await supabase.from("doc_batches").update(row).eq("id", form.id)
      : await supabase.from("doc_batches").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setForm(null);
    qc.invalidateQueries({ queryKey: ["batches"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this record?")) return;
    const { error } = await supabase.from("doc_batches").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["batches"] });
  }

  const totalPeople = batches.reduce((s, b) => s + b.people_count, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-6">
        <div>
          <div className="mb-3 flex h-2 w-24">
            <span className="flex-1 bg-foreground" />
            <span className="flex-1 bg-accent" />
            <span className="flex-1 bg-gold" />
          </div>
          <h1 className="font-display text-5xl leading-none md:text-7xl">German Doc Tracker</h1>
          <p className="mt-2 font-mono text-sm uppercase tracking-widest text-muted-foreground">Masters BD · doc submission mail rounds</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {email ? (
            <>
              <span className="text-muted-foreground">{email}{isAdmin ? " (admin)" : ""}</span>
              <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
            </>
          ) : (
            <Link to="/admin-login" className="text-muted-foreground underline">Admin</Link>
          )}
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-px border-2 border-foreground bg-foreground md:grid-cols-3">
        <Stat label="Mail rounds recorded" value={batches.length} />
        <Stat label="People got docs" value={totalPeople} />
        <Stat label="Next expected" value={predictions[0] ? fmtMonth(predictions[0].mailMonth) : "—"} />
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-3xl">History</h2>
          {isAdmin && <Button onClick={() => setForm(empty)}>+ Add month</Button>}
        </div>
        <div className="overflow-x-auto border-2 border-foreground bg-card">
          <table className="w-full text-sm">
            <thead className="bg-foreground text-background">
              <tr className="text-left font-mono text-xs uppercase tracking-wider">
                <th className="p-3">Mail month</th>
                <th className="p-3">Submissions covered</th>
                <th className="p-3 text-right">Days</th>
                <th className="p-3 text-right">People</th>
                <th className="p-3">Notes</th>
                {isAdmin && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Loading…</td></tr>}
              {!isLoading && batches.length === 0 && (
                <tr><td className="p-4 text-muted-foreground" colSpan={6}>No records yet.</td></tr>
              )}
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="p-3 font-medium">{fmtMonth(toDate(b.mail_month))}</td>
                  <td className="p-3 font-mono">{fmtDate(toDate(b.coverage_start))} → {fmtDate(toDate(b.coverage_end))}</td>
                  <td className="p-3 text-right font-mono">{daysBetween(toDate(b.coverage_start), toDate(b.coverage_end)) + 1}</td>
                  <td className="p-3 text-right font-mono font-semibold">{b.people_count}</td>
                  <td className="p-3 text-muted-foreground">{b.notes}</td>
                  {isAdmin && (
                    <td className="whitespace-nowrap p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setForm({
                        id: b.id, mail_month: b.mail_month.slice(0, 7), coverage_start: b.coverage_start,
                        coverage_end: b.coverage_end, people_count: String(b.people_count), notes: b.notes ?? "",
                      })}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(b.id)}>Delete</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-3xl">Next 8 months — projection</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Estimated from history, with recent months weighted more heavily. Estimates only.
        </p>
        <div className="overflow-x-auto border-2 border-foreground bg-card">
          <table className="w-full text-sm">
            <thead className="bg-accent text-accent-foreground">
              <tr className="text-left font-mono text-xs uppercase tracking-wider">
                <th className="p-3">Est. mail month</th>
                <th className="p-3">Est. submissions covered</th>
                <th className="p-3 text-right">Est. people</th>
              </tr>
            </thead>
            <tbody>
              {predictions.length === 0 && (
                <tr><td className="p-4 text-muted-foreground" colSpan={3}>Add at least 2 months of history to see a projection.</td></tr>
              )}
              {predictions.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-medium">{fmtMonth(p.mailMonth)}</td>
                  <td className="p-3 font-mono">{fmtDate(p.coverageStart)} → {fmtDate(p.coverageEnd)}</td>
                  <td className="p-3 text-right font-mono font-semibold">~{p.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Edit month" : "Add month"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <Field label="Month the doc mail came">
                <Input type="month" value={form.mail_month} onChange={(e) => setForm({ ...form, mail_month: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Covered submissions from">
                  <Input type="date" value={form.coverage_start} onChange={(e) => setForm({ ...form, coverage_start: e.target.value })} />
                </Field>
                <Field label="Covered submissions to">
                  <Input type="date" value={form.coverage_end} onChange={(e) => setForm({ ...form, coverage_end: e.target.value })} />
                </Field>
              </div>
              <Field label="Number of people who got docs">
                <Input type="number" min={0} value={form.people_count} onChange={(e) => setForm({ ...form, people_count: e.target.value })} />
              </Field>
              <Field label="Notes (optional)">
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
