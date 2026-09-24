import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Users,
  Clock,
  Sparkles,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Lock,
  LogOut,
  ShieldCheck,
  CalendarDays,
  FileText,
  CheckCircle2,
  Info,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  type ForecastMode,
  CATEGORIES,
  MAX_COVERAGE_DATE_STR,
  forecast,
  toDate,
  daysBetween,
  fmtMonth,
  fmtDate,
  getBatchMailDate,
  subtractMonths,
  predictUserDocMail,
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
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [calcCategory, setCalcCategory] = useState<Category>("masters");
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [forecastMode, setForecastMode] = useState<ForecastMode>("till_april");

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

  const predictions = useMemo(
    () => forecast(categoryBatches, forecastMode),
    [categoryBatches, forecastMode],
  );

  const currentCategoryInfo = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0]!,
    [activeCategory],
  );

  const calcBatches = useMemo(() => {
    return batches
      .filter((b) => (b.category || "masters") === calcCategory)
      .sort((a, b) => getBatchMailDate(b).getTime() - getBatchMailDate(a).getTime());
  }, [batches, calcCategory]);

  const userPrediction = useMemo(() => {
    return predictUserDocMail(calcBatches, appointmentDate);
  }, [calcBatches, appointmentDate]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top German Flag Accent Strip */}
      <div className="h-1.5 w-full flex">
        <span className="flex-1 bg-zinc-950 dark:bg-zinc-800" />
        <span className="flex-1 bg-red-600" />
        <span className="flex-1 bg-amber-500" />
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        {/* Header Section */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-mono text-muted-foreground backdrop-blur-sm mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Embassy Monitor • Bangladesh to Germany
            </div>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tight">
              German Doc Tracker
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span>{currentCategoryInfo.icon}</span>
              <span>{currentCategoryInfo.description}</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {email ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="max-w-[150px] truncate font-medium text-foreground">{email}</span>
                  {isAdmin && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase">
                      Admin
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                <Link to="/admin-login">
                  <Lock className="h-3.5 w-3.5" />
                  Admin Login
                </Link>
              </Button>
            )}
          </div>
        </header>

        {/* Category Navigation Tabs */}
        <nav aria-label="Visa categories" className="mt-8">
          <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-card border border-border/80 shadow-xs">
            {CATEGORIES.map((cat) => {
              const count = batches.filter((b) => (b.category || "masters") === cat.id).length;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`group relative flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-foreground text-background shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="text-base">{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-mono transition-colors ${
                      isActive
                        ? "bg-background text-foreground font-bold"
                        : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/10"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Personal Doc Mail Arrival Predictor & Coverage Checker Form */}
        <section className="mt-8">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 mb-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Doc Mail Arrival Calculator
                </div>
                <h2 className="font-display text-2xl md:text-3xl tracking-tight">
                  Check When Your Doc Mail Will Arrive
                </h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                  Select your visa track and the day you submitted your appointment request.
                  We'll check whether your date has already been covered or predict when your doc request mail will be issued.
                </p>
              </div>
            </div>

            {/* Input Form Controls */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
              {/* Category Picker */}
              <div className="md:col-span-6 space-y-2">
                <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Visa Category / Track
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = calcCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setCalcCategory(cat.id);
                          setActiveCategory(cat.id);
                        }}
                        className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? "border-foreground bg-foreground text-background shadow-xs font-bold"
                            : "border-border bg-background hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-base">{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Appointment Date Input */}
              <div className="md:col-span-6 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="appDate" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Appointment Taking / Submission Date
                  </Label>
                  <span className="text-[11px] font-mono text-muted-foreground">Max Apr 2026</span>
                </div>
                <div className="relative">
                  <Input
                    id="appDate"
                    type="date"
                    max={MAX_COVERAGE_DATE_STR}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="h-11 rounded-xl font-mono text-sm pl-3 pr-9"
                  />
                  {appointmentDate && (
                    <button
                      type="button"
                      onClick={() => setAppointmentDate("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Results Display Panel */}
            <div className="mt-6">
              {!appointmentDate && (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-5 text-center text-xs text-muted-foreground font-mono flex items-center justify-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground/60" />
                  Select your appointment submission date above to calculate your doc mail prediction.
                </div>
              )}

              {appointmentDate && userPrediction && userPrediction.status === "already_covered" && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-5 md:p-6 text-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Already Covered!
                    </span>
                    <span className="text-xs font-mono text-emerald-800 dark:text-emerald-300">
                      Your Date: {fmtDate(toDate(appointmentDate))}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-2xl text-emerald-950 dark:text-emerald-100">
                    Your appointment date was covered in the round on {fmtDate(userPrediction.mailDate)}!
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                    <div className="rounded-lg bg-background/80 px-3 py-1.5 border border-emerald-500/20">
                      <span className="text-muted-foreground">Round Coverage: </span>
                      <span className="font-semibold text-foreground">
                        {fmtDate(userPrediction.coverageStart)} → {fmtDate(userPrediction.coverageEnd)}
                      </span>
                    </div>
                    {userPrediction.batchName && (
                      <div className="rounded-lg bg-background/80 px-3 py-1.5 border border-emerald-500/20 text-muted-foreground">
                        Batch: {userPrediction.batchName}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-emerald-900/80 dark:text-emerald-200/80 flex items-start gap-1.5">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      If you took your appointment on or before {fmtDate(userPrediction.coverageEnd)} and did not receive your document request mail, check your spam/junk folder or contact the embassy.
                    </span>
                  </p>
                </div>
              )}

              {appointmentDate && userPrediction && userPrediction.status === "already_covered_prior" && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-5 md:p-6 text-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Already Covered!
                  </span>
                  <h3 className="mt-3 font-display text-2xl text-emerald-950 dark:text-emerald-100">
                    Your date ({fmtDate(toDate(appointmentDate))}) has already passed coverage!
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your appointment submission date is earlier than our earliest recorded round ({fmtDate(userPrediction.earliestRecorded)}).
                  </p>
                </div>
              )}

              {appointmentDate && userPrediction && userPrediction.status === "projected" && (
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card p-5 md:p-6 text-foreground shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-mono font-semibold text-amber-800 dark:text-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                      Expected in Round #{userPrediction.roundNumber} from now
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      Your Date: {fmtDate(toDate(appointmentDate))}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-baseline gap-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Predicted Doc Mail Date:
                    </span>
                    <div className="font-display text-3xl sm:text-4xl text-primary font-bold">
                      ~ {fmtDate(userPrediction.predictedMailDate)}
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-mono font-semibold text-primary">
                      {userPrediction.daysRemaining > 0
                        ? `~ in ${userPrediction.daysRemaining} days (${Math.max(1, Math.round(userPrediction.daysRemaining / 30))} mo)`
                        : "Due anytime now"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border/80 bg-background/80 p-3.5">
                      <span className="text-[11px] font-mono uppercase text-muted-foreground">
                        Your Coverage Window
                      </span>
                      <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                        {fmtDate(userPrediction.coverageStart)} → {fmtDate(userPrediction.coverageEnd)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-background/80 p-3.5">
                      <span className="text-[11px] font-mono uppercase text-muted-foreground">
                        Submission Queue Ahead
                      </span>
                      <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                        ~{userPrediction.submissionDaysAhead} days of submissions
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-background/80 p-3.5">
                      <span className="text-[11px] font-mono uppercase text-muted-foreground">
                        Latest Covered Round
                      </span>
                      <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                        Up to {fmtDate(userPrediction.latestCoveredDate)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Calculated dynamically based on recent submission advance pace. Exact dates depend on Embassy release schedules.
                    </span>
                  </p>
                </div>
              )}

              {appointmentDate && userPrediction && userPrediction.status === "beyond_cap" && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-5 text-foreground">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold text-sm">
                    <AlertCircle className="h-4 w-4" />
                    Appointment Date Beyond Tracked Cap (30 April 2026)
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The Embassy doc submission tracker model tracks applicants who registered up to 30 April 2026.
                  </p>
                </div>
              )}

              {appointmentDate && userPrediction && (userPrediction.status === "insufficient_data" || userPrediction.status === "no_data") && (
                <div className="rounded-2xl border border-border bg-card p-5 text-foreground">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Info className="h-4 w-4" />
                    {userPrediction.message}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* History Section */}
        <section className="mt-10">
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-all">
            <div
              className={`flex flex-wrap items-center justify-between gap-4 p-5 md:p-6 bg-card/60 transition-colors ${
                isHistoryExpanded ? "border-b border-border/80" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="flex items-center gap-3 text-left group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-2xl md:text-3xl group-hover:text-primary transition-colors">
                      History — {currentCategoryInfo.label}
                    </h2>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {categoryBatches.length} rounds
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono flex items-center gap-1.5">
                    <span>Recorded doc submission rounds for {currentCategoryInfo.label}</span>
                    <span className="text-muted-foreground/60">•</span>
                    <span className="text-primary/80 font-medium group-hover:underline">
                      {isHistoryExpanded ? "Click to collapse" : "Click to expand"}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-border/80 bg-background/80 p-1.5 text-muted-foreground group-hover:text-foreground group-hover:border-foreground/30 transition-all">
                  {isHistoryExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="rounded-xl text-xs gap-1.5 font-medium"
                >
                  {isHistoryExpanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Hide History
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show History ({categoryBatches.length})
                    </>
                  )}
                </Button>

                {isAdmin && (
                  <Button
                    onClick={() => {
                      setForm(emptyForm(activeCategory));
                      setIsHistoryExpanded(true);
                    }}
                    className="gap-2 rounded-xl shadow-xs"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add {currentCategoryInfo.label} Round
                  </Button>
                )}
              </div>
            </div>

            {isHistoryExpanded && (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3.5 px-4">Doc Mail Date</th>
                    <th className="py-3.5 px-4">Mail Month</th>
                    <th className="py-3.5 px-4">Submissions Covered</th>
                    <th className="py-3.5 px-4 text-right">Window</th>
                    <th className="py-3.5 px-4 text-right">Candidates</th>
                    <th className="py-3.5 px-4">Notes</th>
                    {isAdmin && <th className="py-3.5 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {isLoading && (
                    <tr>
                      <td className="p-8 text-center text-muted-foreground" colSpan={isAdmin ? 7 : 6}>
                        <div className="inline-flex items-center gap-2 text-sm font-mono">
                          <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          Loading records…
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading && categoryBatches.length === 0 && (
                    <tr>
                      <td className="p-12 text-center text-muted-foreground" colSpan={isAdmin ? 7 : 6}>
                        <div className="max-w-sm mx-auto space-y-2">
                          <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/60" />
                          <p className="font-medium text-foreground">
                            No records found for {currentCategoryInfo.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isAdmin
                              ? "Click the button above to record the first round."
                              : "No doc rounds recorded yet for this category."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {categoryBatches.map((b, idx) => {
                    const mailDate = getBatchMailDate(b);
                    const days = daysBetween(toDate(b.coverage_start), toDate(b.coverage_end)) + 1;
                    const isLatest = idx === 0;

                    return (
                      <tr
                        key={b.id}
                        className={`transition-colors hover:bg-muted/40 ${
                          isLatest ? "bg-primary/[0.02]" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <span>{fmtDate(mailDate)}</span>
                            {isLatest && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                Latest
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground font-medium">
                          {fmtMonth(toDate(b.mail_month))}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 font-mono text-xs text-foreground">
                            <span>{fmtDate(toDate(b.coverage_start))}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-semibold">{fmtDate(toDate(b.coverage_end))}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs">
                          <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                            {days} days
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">
                          <span className="text-foreground">{b.people_count.toLocaleString()}</span>
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground text-xs max-w-xs truncate">
                          {b.notes ? (
                            <span title={b.notes}>{b.notes}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
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
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive"
                                onClick={() => remove(b.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </section>

        {/* Projection Section */}
        <section className="mt-12">
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 p-5 md:p-6 bg-gradient-to-r from-amber-500/5 via-card to-card">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl md:text-3xl">
                    {forecastMode === "till_april"
                      ? `Monthly Projection — Through April (${currentCategoryInfo.label})`
                      : `Monthly Projection — All Rounds to April 2026 Cap (${currentCategoryInfo.label})`}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-amber-700 dark:text-amber-400">
                    <Sparkles className="h-3 w-3" />
                    Pace Model
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  {forecastMode === "till_april"
                    ? "Consecutive monthly rounds scheduled every month through April."
                    : "Consecutive monthly rounds advancing submission coverage up to the April 2026 cap."}
                </p>
              </div>

              <div className="inline-flex items-center rounded-xl border border-border/80 bg-background/80 p-1 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setForecastMode("till_april")}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-all cursor-pointer ${
                    forecastMode === "till_april"
                      ? "bg-foreground text-background shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Through April
                </button>
                <button
                  type="button"
                  onClick={() => setForecastMode("all_to_cap")}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-all cursor-pointer ${
                    forecastMode === "all_to_cap"
                      ? "bg-foreground text-background shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All to April 2026 Cap
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3.5 px-4">Est. Mail Date</th>
                    <th className="py-3.5 px-4">Est. Mail Month</th>
                    <th className="py-3.5 px-4">Est. Submissions Covered</th>
                    <th className="py-3.5 px-4 text-right">Window</th>
                    <th className="py-3.5 px-4 text-right">Est. Candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {predictions.length === 0 && (
                    <tr>
                      <td className="p-10 text-center text-muted-foreground" colSpan={5}>
                        <div className="max-w-sm mx-auto space-y-1.5 font-mono text-xs">
                          <p className="font-medium text-foreground">Insufficient Data for Forecast</p>
                          <p className="text-muted-foreground">
                            Add at least 2 {currentCategoryInfo.label} rounds to compute historical cadence and projections.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {predictions.map((p, i) => (
                    <tr
                      key={i}
                      className="transition-colors hover:bg-amber-500/[0.03]"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-primary">
                        <div className="inline-flex items-center gap-2">
                          <span className="text-amber-600 dark:text-amber-400">~</span>
                          <span>{fmtDate(p.predictedMailDate)}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground font-medium">
                        {fmtMonth(p.mailMonth)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1 font-mono text-xs text-foreground">
                          <span>{fmtDate(p.coverageStart)}</span>
                          <ArrowRight className="h-3 w-3 text-amber-600/60" />
                          <span className="font-semibold">{fmtDate(p.coverageEnd)}</span>
                          {p.isMaxCovered && (
                            <span className="ml-1 rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              Cap
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                          {p.daysCovered} days
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                        ~{p.people.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Add / Edit Dialog */}
        <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent className="max-w-md sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                {form?.id ? "Edit Doc Round" : "Add New Doc Round"}
              </DialogTitle>
            </DialogHeader>
            {form && (
              <div className="space-y-4 pt-2">
                <Field label="Category / Track">
                  <Select
                    value={form.category}
                    onValueChange={(val: Category) => setForm({ ...form, category: val })}
                  >
                    <SelectTrigger className="w-full rounded-xl">
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

                <Field label="Date Doc Mail Was Issued">
                  <Input
                    type="date"
                    required
                    className="rounded-xl"
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
                    className="h-7 text-xs px-2.5 rounded-lg gap-1 border-dashed"
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
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Suggest (-29 / -28 mo)
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Submissions From">
                    <Input
                      type="date"
                      required
                      className="rounded-xl"
                      value={form.coverage_start}
                      onChange={(e) => setForm({ ...form, coverage_start: e.target.value })}
                    />
                  </Field>
                  <Field label="Submissions To (Max Apr 2026)">
                    <Input
                      type="date"
                      required
                      className="rounded-xl"
                      max={MAX_COVERAGE_DATE_STR}
                      value={form.coverage_end}
                      onChange={(e) => setForm({ ...form, coverage_end: e.target.value })}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono -mt-1 flex items-center gap-1">
                  <Info className="h-3 w-3 inline text-muted-foreground/80" />
                  Editing dates is decoupled. Maximum submission cover date is 30 Apr 2026.
                </p>

                <Field label="Number of Candidates Received Docs">
                  <Input
                    type="number"
                    min={0}
                    required
                    className="rounded-xl"
                    placeholder="e.g. 300"
                    value={form.people_count}
                    onChange={(e) => setForm({ ...form, people_count: e.target.value })}
                  />
                </Field>

                <Field label="Notes (optional)">
                  <Textarea
                    className="rounded-xl resize-none"
                    rows={3}
                    placeholder="e.g. Regular round, specific observations..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </div>
            )}
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button onClick={save} className="rounded-xl shadow-xs">
                Save Round
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}
