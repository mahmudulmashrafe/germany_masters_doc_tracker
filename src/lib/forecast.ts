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

export type ForecastMode = "till_april" | "all_to_cap";

export function getMonthsUntilNextApril(fromDate: Date): number {
  const currentMonth = fromDate.getUTCMonth(); // 0 = Jan, 3 = Apr, 8 = Sep, 11 = Dec
  // If current month is before April (Jan, Feb, Mar):
  // next April is in the current calendar year (e.g. Jan -> 3 months: Feb, Mar, Apr)
  if (currentMonth < 3) {
    return 3 - currentMonth;
  }
  // If current month is April or later (Apr..Dec):
  // next April is in the following calendar year (e.g. Sep -> 7 months: Oct, Nov, Dec, Jan, Feb, Mar, Apr)
  return 12 - currentMonth + 3;
}

export function forecast(batches: Batch[], mode: ForecastMode = "till_april"): Prediction[] {
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

  const last = sorted[sorted.length - 1]!;
  let prevEnd = toDate(last.coverage_end);
  const lastMailDate = getBatchMailDate(last);
  const lastMailMonth = toDate(last.mail_month);
  const lastMailDay = lastMailDate.getUTCDate();

  const maxRounds =
    mode === "till_april"
      ? getMonthsUntilNextApril(lastMailMonth)
      : 48;

  const out: Prediction[] = [];

  for (let i = 1; i <= maxRounds; i++) {
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

    // Consecutive monthly cadence: every month must come
    const mailMonth = addMonths(lastMailMonth, i);
    const targetYear = mailMonth.getUTCFullYear();
    const targetM = mailMonth.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(targetYear, targetM + 1, 0)).getUTCDate();
    const day = Math.min(lastMailDay, daysInMonth);
    const predictedMailDate = new Date(Date.UTC(targetYear, targetM, day));

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

export function getCategoryMetrics(batches: Batch[]) {
  if (!batches.length) {
    return {
      totalPeople: 0,
      avgIntervalDays: null,
      avgAdvanceDays: null,
      latestBatch: null,
    };
  }

  const sorted = [...batches].sort(
    (a, b) => getBatchMailDate(a).getTime() - getBatchMailDate(b).getTime(),
  );
  const totalPeople = sorted.reduce((s, b) => s + (b.people_count || 0), 0);
  const latestBatch = sorted[sorted.length - 1]!;

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(getBatchMailDate(sorted[i - 1]!), getBatchMailDate(sorted[i]!));
    if (gap > 0) intervals.push(gap);
  }
  const avgIntervalDays = intervals.length
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : null;

  const advances: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const adv = daysBetween(toDate(sorted[i - 1]!.coverage_end), toDate(sorted[i]!.coverage_end));
    if (adv > 0) advances.push(adv);
  }
  const avgAdvanceDays = advances.length
    ? Math.round(advances.reduce((a, b) => a + b, 0) / advances.length)
    : null;

  return {
    totalPeople,
    avgIntervalDays,
    avgAdvanceDays,
    latestBatch,
  };
}

export type UserPredictionResult =
  | {
      status: "already_covered";
      batchName: string;
      mailDate: Date;
      coverageStart: Date;
      coverageEnd: Date;
    }
  | {
      status: "already_covered_prior";
      earliestRecorded: Date;
    }
  | {
      status: "projected";
      predictedMailDate: Date;
      coverageStart: Date;
      coverageEnd: Date;
      roundNumber: number;
      daysRemaining: number;
      submissionDaysAhead: number;
      latestCoveredDate: Date;
    }
  | {
      status: "beyond_cap";
      maxDate: string;
    }
  | {
      status: "insufficient_data";
      message: string;
    }
  | {
      status: "no_data";
      message: string;
    };

export function predictUserDocMail(
  batches: Batch[],
  appointmentDateStr: string,
): UserPredictionResult | null {
  if (!appointmentDateStr) return null;
  const appDate = toDate(appointmentDateStr);
  if (isNaN(appDate.getTime())) return null;

  if (!batches.length) {
    return { status: "no_data", message: "No document rounds recorded yet for this category." };
  }

  // Check if date is after April 30, 2026 cap
  if (appointmentDateStr > MAX_COVERAGE_DATE_STR) {
    return { status: "beyond_cap", maxDate: MAX_COVERAGE_DATE_STR };
  }

  const sorted = [...batches].sort(
    (a, b) => toDate(a.coverage_start).getTime() - toDate(b.coverage_start).getTime(),
  );

  // Check if already covered by an existing batch
  for (const b of sorted) {
    const start = toDate(b.coverage_start);
    const end = toDate(b.coverage_end);
    if (appDate.getTime() >= start.getTime() && appDate.getTime() <= end.getTime()) {
      return {
        status: "already_covered",
        batchName: b.notes || fmtMonth(toDate(b.mail_month)),
        mailDate: getBatchMailDate(b),
        coverageStart: start,
        coverageEnd: end,
      };
    }
  }

  const earliestStart = toDate(sorted[0]!.coverage_start);
  if (appDate.getTime() < earliestStart.getTime()) {
    return {
      status: "already_covered_prior",
      earliestRecorded: earliestStart,
    };
  }

  // Not yet covered - check if we have enough batches to project
  if (batches.length < 2) {
    return {
      status: "insufficient_data",
      message: "At least 2 rounds are needed to compute turnaround pace and estimate your mail date.",
    };
  }

  // Sort chronologically by mail date for forecasting
  const sortedByMail = [...batches].sort(
    (x, y) => getBatchMailDate(x).getTime() - getBatchMailDate(y).getTime(),
  );

  // How many days of submissions each mail round moves forward
  const advances: number[] = [];
  for (let i = 1; i < sortedByMail.length; i++) {
    const d = daysBetween(toDate(sortedByMail[i - 1]!.coverage_end), toDate(sortedByMail[i]!.coverage_end));
    if (d > 0) advances.push(d);
  }
  const advance = Math.max(
    1,
    Math.round(
      advances.length
        ? weightedAvg(advances.slice(-4))
        : daysBetween(toDate(sortedByMail[0]!.coverage_start), toDate(sortedByMail[0]!.coverage_end)) + 1,
    ),
  );

  // Intervals (in days) between consecutive mail delivery dates
  const mailIntervals: number[] = [];
  for (let i = 1; i < sortedByMail.length; i++) {
    const gap = daysBetween(getBatchMailDate(sortedByMail[i - 1]!), getBatchMailDate(sortedByMail[i]!));
    if (gap > 0) mailIntervals.push(gap);
  }
  const avgMailInterval = Math.max(
    14,
    Math.round(mailIntervals.length ? weightedAvg(mailIntervals.slice(-4)) : 30),
  );

  // Find latest coverage end across all batches
  const sortedByEnd = [...batches].sort(
    (a, b) => toDate(b.coverage_end).getTime() - toDate(a.coverage_end).getTime(),
  );
  const latestCoverageEnd = toDate(sortedByEnd[0]!.coverage_end);
  const lastMailBatch = sortedByMail[sortedByMail.length - 1]!;
  const lastMailDate = getBatchMailDate(lastMailBatch);
  const lastMailMonth = toDate(lastMailBatch.mail_month);
  const lastMailDay = lastMailDate.getUTCDate();

  const submissionDaysAhead = Math.max(0, daysBetween(latestCoverageEnd, appDate));

  // Run forward projection steps (up to 48 rounds or until covered / cap reached)
  let prevEnd = latestCoverageEnd;
  for (let round = 1; round <= 48; round++) {
    const start = addDays(prevEnd, 1);
    let end = addDays(prevEnd, advance);
    if (end.getTime() >= MAX_COVERAGE_DATE.getTime()) {
      end = MAX_COVERAGE_DATE;
    }

    // Monthly cadence: every month comes sequentially
    const mailMonth = addMonths(lastMailMonth, round);
    const targetYear = mailMonth.getUTCFullYear();
    const targetM = mailMonth.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(targetYear, targetM + 1, 0)).getUTCDate();
    const day = Math.min(lastMailDay, daysInMonth);
    const predictedMailDate = new Date(Date.UTC(targetYear, targetM, day));

    const now = new Date();
    const daysRemaining = Math.max(0, daysBetween(now, predictedMailDate));

    if (appDate.getTime() >= start.getTime() && appDate.getTime() <= end.getTime()) {
      return {
        status: "projected",
        predictedMailDate,
        coverageStart: start,
        coverageEnd: end,
        roundNumber: round,
        daysRemaining,
        submissionDaysAhead,
        latestCoveredDate: latestCoverageEnd,
      };
    }

    if (end.getTime() >= MAX_COVERAGE_DATE.getTime()) {
      break;
    }
    prevEnd = end;
  }

  // If still not matched, cap calculation
  return {
    status: "beyond_cap",
    maxDate: MAX_COVERAGE_DATE_STR,
  };
}

