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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  type Batch,
  type Category,
  CATEGORIES,
  MAX_COVERAGE_DATE_STR,
  forecast,
  toDate,
  daysBetween,
  fmtMonth,
  fmtDate,
  getBatchMailDate,
  subtractMonths,
} from "@/lib/forecast";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "German Doc Tracker — Masters, Bachelor & Family BD" },
      {
        name: "description",
        content:
          "Track German doc submission mail rounds for Masters, Bachelor, and Family Reunion applicants from Bangladesh, with accurate mail arrival dates and 8-month projections.",
      },
      { property: "og:title", content: "German Doc Tracker — Masters, Bachelor & Family BD" },
      {
        property: "og:description",
        content:
          "Past doc mail rounds and next 8-month projections for Masters, Bachelor, and Family Reunion applicants.",
      },
    ],
  }),
  component: Index,
});

type Form = {
  id?: string;
  category: Category;
  mail_date: string;
  coverage_start: string;
  coverage_end: string;
  people_count: string;
  notes: string;
};

const emptyForm = (cat: Category): Form => {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = subtractMonths(today, 29);
  const defaultEnd = subtractMonths(today, 28);
  return {
    category: cat,
    mail_date: today,
    coverage_start: defaultStart,
    coverage_end: defaultEnd > MAX_COVERAGE_DATE_STR ? MAX_COVERAGE_DATE_STR : defaultEnd,
    people_count: "",
    notes: "",
  };
};

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
  const [activeCategory, setActiveCategory] = useState<Category>("masters");
  const [form, setForm] = useState<Form | null>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_batches")
        .select("*")
        .order("mail_month", { ascending: false });
      if (error) throw error;
      return (data || []) as Batch[];
    },
  });

  // Filter batches for the currently selected category tab
  const categoryBatches = useMemo(() => {
    return batches
      .filter((b) => (b.category || "masters") === activeCategory)
      .sort((a, b) => getBatchMailDate(b).getTime() - getBatchMailDate(a).getTime());
  }, [batches, activeCategory]);

  const predictions = useMemo(() => forecast(categoryBatches), [categoryBatches]);

  const currentCategoryInfo = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0]!,
    [activeCategory],
  );

  async function save() {
    if (!form) return;
    if (!form.mail_date || !form.coverage_start || !form.coverage_end) {
      toast.error("Please fill in all dates");
      return;
    }
    if (form.coverage_end < form.coverage_start) {
      toast.error("Coverage end date must be after start date");
      return;
    }
    if (form.coverage_end > MAX_COVERAGE_DATE_STR) {
      toast.error(`Coverage end date cannot exceed April 2026 (${MAX_COVERAGE_DATE_STR})`);
      return;
    }

    const row = {
      category: form.category,
      mail_date: form.mail_date,
      mail_month: form.mail_date.slice(0, 7) + "-01",
      coverage_start: form.coverage_start,
      coverage_end: form.coverage_end,
      people_count: Number(form.people_count) || 0,
      notes: form.notes || null,
    };

    const { error } = form.id
      ? await supabase.from("doc_batches").update(row).eq("id", form.id)
      : await supabase.from("doc_batches").insert(row);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Record saved successfully");
    setForm(null);
    qc.invalidateQueries({ queryKey: ["batches"] });
  }

  async function remove(id: string) {
    if (!confirm("Are you sure you want to delete this doc round record?")) return;
    const { error } = await supabase.from("doc_batches").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Record deleted");
    qc.invalidateQueries({ queryKey: ["batches"] });
  }

  const totalPeople = categoryBatches.reduce((s, b) => s + (b.people_count || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-6">
        <div>
          <div className="mb-3 flex h-2 w-24">
            <span className="flex-1 bg-foreground" />
            <span className="flex-1 bg-accent" />
            <span className="flex-1 bg-gold" />
          </div>
          <h1 className="font-display text-5xl leading-none md:text-7xl">German Doc Tracker</h1>
          <p className="mt-2 font-mono text-sm uppercase tracking-widest text-muted-foreground">
            {currentCategoryInfo.description}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {email ? (
            <>
              <span className="text-muted-foreground">
                {email}
                {isAdmin ? " (admin)" : ""}
              </span>
              <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Link to="/admin-login" className="text-muted-foreground underline hover:text-foreground">
              Admin Login
            </Link>
          )}
        </div>
      </header>

      {/* Category Tabs */}
      <nav aria-label="Visa categories" className="mt-8 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const count = batches.filter((b) => (b.category || "masters") === cat.id).length;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2.5 rounded-none border-2 px-5 py-3 font-mono text-sm uppercase tracking-wider transition-all cursor-pointer ${
                isActive
                  ? "border-foreground bg-foreground text-background shadow-md font-bold"
                  : "border-border bg-card text-foreground hover:border-foreground/50"
              }`}
            >
              <span className="text-lg">{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`ml-1 px-1.5 py-0.5 text-xs font-semibold ${
                  isActive ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Stats Summary */}
      <section className="mt-8 grid grid-cols-2 gap-px border-2 border-foreground bg-foreground md:grid-cols-3">
        <Stat label={`${currentCategoryInfo.label} rounds recorded`} value={categoryBatches.length} />
        <Stat label="Total people received docs" value={totalPeople.toLocaleString()} />
        <Stat
          label="Next expected mail date"
          value={predictions[0] ? fmtDate(predictions[0].predictedMailDate) : "—"}
        />
      </section>

      {/* History Table */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl">History — {currentCategoryInfo.label}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground font-mono">
              Recorded doc submission rounds for {currentCategoryInfo.label}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setForm(emptyForm(activeCategory))}>
              + Add {currentCategoryInfo.label} round
            </Button>
          )}
        </div>
        <div className="overflow-x-auto border-2 border-foreground bg-card">
          <table className="w-full text-sm">
            <thead className="bg-foreground text-background">
              <tr className="text-left font-mono text-xs uppercase tracking-wider">
                <th className="p-3">Doc mail date</th>
                <th className="p-3">Mail month</th>
                <th className="p-3">Submissions covered</th>
                <th className="p-3 text-right">Days</th>
                <th className="p-3 text-right">People</th>
                <th className="p-3">Notes</th>
                {isAdmin && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={isAdmin ? 7 : 6}>
                    Loading records…
                  </td>
                </tr>
              )}
              {!isLoading && categoryBatches.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={isAdmin ? 7 : 6}>
                    No records found for {currentCategoryInfo.label}.
                    {isAdmin && " Click '+ Add round' above to record the first round."}
                  </td>
                </tr>
              )}
              {categoryBatches.map((b) => {
                const mailDate = getBatchMailDate(b);
                const days = daysBetween(toDate(b.coverage_start), toDate(b.coverage_end)) + 1;
                return (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                    <td className="p-3 font-semibold font-mono">{fmtDate(mailDate)}</td>
                    <td className="p-3 text-muted-foreground font-medium">{fmtMonth(toDate(b.mail_month))}</td>
                    <td className="p-3 font-mono">
                      {fmtDate(toDate(b.coverage_start))} → {fmtDate(toDate(b.coverage_end))}
                    </td>
                    <td className="p-3 text-right font-mono">{days}</td>
                    <td className="p-3 text-right font-mono font-semibold">{b.people_count}</td>
                    <td className="p-3 text-muted-foreground max-w-xs truncate">{b.notes || "—"}</td>
                    {isAdmin && (
                      <td className="whitespace-nowrap p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm({
                              id: b.id,
                              category: (b.category as Category) || "masters",
                              mail_date: b.mail_date || b.mail_month,
                              coverage_start: b.coverage_start,
                              coverage_end: b.coverage_end,
                              people_count: String(b.people_count),
                              notes: b.notes ?? "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove(b.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Projection Table */}
      <section className="mt-14">
        <div className="mb-4">
          <h2 className="font-display text-3xl">
            Next 8 months — projection ({currentCategoryInfo.label})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated next doc mail release dates and submission windows (capped at April 2026 max).
          </p>
        </div>
        <div className="overflow-x-auto border-2 border-foreground bg-card">
          <table className="w-full text-sm">
            <thead className="bg-accent text-accent-foreground">
              <tr className="text-left font-mono text-xs uppercase tracking-wider">
                <th className="p-3">Est. mail date</th>
                <th className="p-3">Est. mail month</th>
                <th className="p-3">Est. submissions covered</th>
                <th className="p-3 text-right">Est. days</th>
                <th className="p-3 text-right">Est. people</th>
              </tr>
            </thead>
            <tbody>
              {predictions.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={5}>
                    Add at least 2 {currentCategoryInfo.label} rounds to generate predictions.
                  </td>
                </tr>
              )}
              {predictions.map((p, i) => (
                <tr key={i} className="border-t border-border hover:bg-accent/10 transition-colors">
                  <td className="p-3 font-semibold font-mono text-primary">
                    ~ {fmtDate(p.predictedMailDate)}
                  </td>
                  <td className="p-3 font-medium">{fmtMonth(p.mailMonth)}</td>
                  <td className="p-3 font-mono">
                    {fmtDate(p.coverageStart)} → {fmtDate(p.coverageEnd)}
                  </td>
                  <td className="p-3 text-right font-mono">{p.daysCovered}</td>
                  <td className="p-3 text-right font-mono font-semibold">~{p.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add / Edit Dialog */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {form?.id ? "Edit doc round" : "Add new doc round"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4 pt-2">
              <Field label="Category / Track">
                <Select
                  value={form.category}
                  onValueChange={(val: Category) => setForm({ ...form, category: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select track" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Date the doc mail was issued">
                <Input
                  type="date"
                  required
                  value={form.mail_date}
                  onChange={(e) => setForm({ ...form, mail_date: e.target.value })}
                />
              </Field>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-mono font-medium text-muted-foreground">
                  Submissions Covered:
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() =>
                    setForm({
                      ...form,
                      coverage_start: subtractMonths(form.mail_date, 29),
                      coverage_end:
                        subtractMonths(form.mail_date, 28) > MAX_COVERAGE_DATE_STR
                          ? MAX_COVERAGE_DATE_STR
                          : subtractMonths(form.mail_date, 28),
                    })
                  }
                >
                  ⚡ Suggest (-29 / -28 mo)
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Submissions from">
                  <Input
                    type="date"
                    required
                    value={form.coverage_start}
                    onChange={(e) => setForm({ ...form, coverage_start: e.target.value })}
                  />
                </Field>
                <Field label="Submissions to (Max Apr 2026)">
                  <Input
                    type="date"
                    required
                    max={MAX_COVERAGE_DATE_STR}
                    value={form.coverage_end}
                    onChange={(e) => setForm({ ...form, coverage_end: e.target.value })}
                  />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono -mt-2">
                🔒 Editing any date changes ONLY that date. Max submission date is 30 Apr 2026.
              </p>

              <Field label="Number of people who got docs">
                <Input
                  type="number"
                  min={0}
                  required
                  placeholder="e.g. 300"
                  value={form.people_count}
                  onChange={(e) => setForm({ ...form, people_count: e.target.value })}
                />
              </Field>

              <Field label="Notes (optional)">
                <Textarea
                  placeholder="e.g. Regular round, specific observations..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save Round</Button>
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
  return (
    <div className="space-y-1.5">
      <Label className="font-medium">{label}</Label>
      {children}
    </div>
  );
}
