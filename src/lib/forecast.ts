export type Category = "masters" | "bachelor" | "family";

export const CATEGORIES: { id: Category; label: string; icon: string; description: string }[] = [
  { id: "masters", label: "Masters", icon: "🎓", description: "Masters applicants doc mail tracking" },
  { id: "bachelor", label: "Bachelor", icon: "🎒", description: "Bachelor applicants doc mail tracking" },
  { id: "family", label: "Family Reunion", icon: "👨‍👩‍👧", description: "Family reunion visa doc mail tracking" },
];

export const MAX_COVERAGE_DATE_STR = "2026-04-30";
export const MAX_COVERAGE_DATE = new Date("2026-04-30T00:00:00Z");

export type Batch = {
  id: string;
  category?: Category | string;
  mail_date?: string | null;
  mail_month: string;
  coverage_start: string;
  coverage_end: string;
  people_count: number;
  notes: string | null;
};

export type Prediction = {
  predictedMailDate: Date;
  mailMonth: Date;
  coverageStart: Date;
  coverageEnd: Date;
  daysCovered: number;
  people: number;
  isMaxCovered?: boolean;
};

const DAY = 86400000;
export const toDate = (s: string) => {
  if (!s) return new Date();
  // Ensure ISO format YYYY-MM-DD
  const clean = s.length === 7 ? `${s}-01` : s.slice(0, 10);
  return new Date(`${clean}T00:00:00Z`);
};

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const addMonths = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

export function subtractMonths(dateStr: string, monthsToSubtract: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();

  const targetYearMonth = new Date(Date.UTC(y, m - monthsToSubtract, 1));
  const targetYear = targetYearMonth.getUTCFullYear();
  const targetM = targetYearMonth.getUTCMonth();

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetM + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  const target = new Date(Date.UTC(targetYear, targetM, clampedDay));
  return target.toISOString().slice(0, 10);
}

export const getBatchMailDate = (b: Batch): Date => {
  if (b.mail_date) return toDate(b.mail_date);
  return toDate(b.mail_month);
};

// Recent entries count more (weights 1..k)
function weightedAvg(values: number[]) {
  if (!values.length) return 0;
  const w = values.map((_, i) => i + 1);
  const total = w.reduce((a, b) => a + b, 0);
  return values.reduce((s, v, i) => s + v * w[i]!, 0) / total;
}

function linearFit(values: number[]) {
  const n = values.length;
  if (n < 2) return { a: values[0] ?? 0, b: 0 };
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (values[i]! - my);
    den += (x - mx) ** 2;
  });
  const b = den ? num / den : 0;
  return { a: my - b * mx, b };
}

export function forecast(batches: Batch[], months = 8): Prediction[] {
  if (batches.length < 2) return [];

  // Sort chronologically by the actual mail date
  const sorted = [...batches].sort((x, y) => getBatchMailDate(x).getTime() - getBatchMailDate(y).getTime());

  const recent = sorted.slice(-6);
  const people = recent.map((b) => b.people_count);
  const wavg = weightedAvg(people);
  const { a, b } = linearFit(people);

  // How many days of submissions each mail round moves forward
  const advances: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = daysBetween(toDate(sorted[i - 1]!.coverage_end), toDate(sorted[i]!.coverage_end));
    if (d > 0) advances.push(d);
  }
  const advance = Math.max(
    1,
    Math.round(
      advances.length
        ? weightedAvg(advances.slice(-4))
        : daysBetween(toDate(sorted[0]!.coverage_start), toDate(sorted[0]!.coverage_end)) + 1,
    ),
  );

  // Intervals (in days) between consecutive mail delivery dates
  const mailIntervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(getBatchMailDate(sorted[i - 1]!), getBatchMailDate(sorted[i]!));
    if (gap > 0) mailIntervals.push(gap);
  }
  const avgMailInterval = Math.max(
    14,
    Math.round(mailIntervals.length ? weightedAvg(mailIntervals.slice(-4)) : 30),
  );

  const last = sorted[sorted.length - 1]!;
  let prevEnd = toDate(last.coverage_end);
  const lastMailDate = getBatchMailDate(last);
  const out: Prediction[] = [];

  for (let i = 1; i <= months; i++) {
    // If previous round already covered up to April 2026 cap, stop
    if (prevEnd.getTime() >= MAX_COVERAGE_DATE.getTime()) {
      break;
    }

    const trend = a + b * (people.length - 1 + i);
    const p = Math.max(0, Math.round(0.5 * wavg + 0.5 * trend));
    const start = addDays(prevEnd, 1);
    let end = addDays(prevEnd, advance);
    let isMaxCovered = false;

    // Cap at April 30, 2026
    if (end.getTime() >= MAX_COVERAGE_DATE.getTime()) {
      end = MAX_COVERAGE_DATE;
      isMaxCovered = true;
    }

    const daysCovered = Math.max(1, daysBetween(start, end) + 1);
    const predictedMailDate = addDays(lastMailDate, avgMailInterval * i);
    const mailMonth = new Date(Date.UTC(predictedMailDate.getUTCFullYear(), predictedMailDate.getUTCMonth(), 1));

    out.push({
      predictedMailDate,
      mailMonth,
      coverageStart: start,
      coverageEnd: end,
      daysCovered,
      people: p,
      isMaxCovered,
    });

    prevEnd = end;
    if (isMaxCovered) {
      break;
    }
  }
  return out;
}

export function getApril2026Progress(batches: Batch[]) {
  const targetDate = MAX_COVERAGE_DATE;
  if (!batches.length) {
    return {
      latestCoverageEnd: null,
      targetDate,
      daysRemaining: null,
      percent: 0,
      roundsRemaining: null,
      estCompletionDate: null,
      isCompleted: false,
    };
  }

  // Find latest coverage_end across batches in this category
  const sortedByCoverage = [...batches].sort(
    (a, b) => toDate(b.coverage_end).getTime() - toDate(a.coverage_end).getTime(),
  );
  const latestCoverageEnd = toDate(sortedByCoverage[0]!.coverage_end);

  // Earliest coverage_start
  const sortedByStart = [...batches].sort(
    (a, b) => toDate(a.coverage_start).getTime() - toDate(b.coverage_start).getTime(),
  );
  const earliestStart = toDate(sortedByStart[0]!.coverage_start);

  const totalDays = Math.max(1, daysBetween(earliestStart, targetDate));
  const coveredDays = Math.max(0, daysBetween(earliestStart, latestCoverageEnd));
  const percent = Math.min(100, Math.max(0, Math.round((coveredDays / totalDays) * 100)));
  const daysRemaining = Math.max(0, daysBetween(latestCoverageEnd, targetDate));
  const isCompleted = latestCoverageEnd.getTime() >= targetDate.getTime();

  // Determine advance rate from rounds
  const advances: number[] = [];
  for (let i = 1; i < batches.length; i++) {
    const d = daysBetween(toDate(batches[i - 1]!.coverage_end), toDate(batches[i]!.coverage_end));
    if (d > 0) advances.push(d);
  }
  const avgAdvance = advances.length
    ? Math.max(1, Math.round(advances.reduce((a, b) => a + b, 0) / advances.length))
    : 30;

  const roundsRemaining = daysRemaining > 0 ? Math.ceil(daysRemaining / avgAdvance) : 0;

  // Typical interval between mail releases
  const lastMail = getBatchMailDate(sortedByCoverage[0]!);
  const estCompletionDate = roundsRemaining > 0 ? addDays(lastMail, roundsRemaining * 30) : null;

  return {
    latestCoverageEnd,
    targetDate,
    daysRemaining,
    percent,
    roundsRemaining,
    avgAdvance,
    estCompletionDate,
    isCompleted,
  };
}

export const fmtMonth = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
