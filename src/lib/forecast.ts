export type Batch = {
  id: string;
  mail_month: string;
  coverage_start: string;
  coverage_end: string;
  people_count: number;
  notes: string | null;
};

export type Prediction = {
  mailMonth: Date;
  coverageStart: Date;
  coverageEnd: Date;
  people: number;
};

const DAY = 86400000;
export const toDate = (s: string) => new Date(s + "T00:00:00Z");
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMonths = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

// Recent entries count more (weights 1..k)
function weightedAvg(values: number[]) {
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
  const sorted = [...batches].sort((x, y) => x.mail_month.localeCompare(y.mail_month));
  if (sorted.length < 2) return [];

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
  const lastMail = toDate(last.mail_month);
  const out: Prediction[] = [];
  for (let i = 1; i <= months; i++) {
    const trend = a + b * (people.length - 1 + i);
    const p = Math.max(0, Math.round(0.5 * wavg + 0.5 * trend));
    const start = addDays(prevEnd, 1);
    const end = addDays(prevEnd, advance);
    out.push({ mailMonth: addMonths(lastMail, i), coverageStart: start, coverageEnd: end, people: p });
    prevEnd = end;
  }
  return out;
}

export const fmtMonth = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
