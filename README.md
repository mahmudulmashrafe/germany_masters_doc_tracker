# Germany Document Submission Tracker 🇩🇪

A comprehensive web application to track German Embassy document request batches and calculate predictive projections for future document request rounds across **Masters**, **Bachelor**, and **Family Re-union** categories.

## Features

- **Multi-Category Tracking**: Support for Masters, Bachelor, and Family Re-union document batches.
- **Predictive Projections**:
  - Predicts upcoming document mail dates based on average intervals between previous rounds.
  - Submissions covered projection (pace-based calculation up to April 2026 cap).
  - Estimated days until next mail round.
- **Admin Dashboard**:
  - Secure Supabase authentication for admins.
  - Add, edit, and delete document rounds.
  - Smart default date calculation (defaults to 29 months prior for submission start date and 28 months prior for submission end date when selecting a mail date).
  - Independent date editing to prevent accidental cascade shifts.
- **Public Insights**:
  - Beautiful metrics: Latest round, total candidates covered, average turnaround time, coverage pace.
  - Interactive prediction cards with confidence metrics.
  - Historical batch timeline with candidate counts and notes.

## Tech Stack

- **Framework**: TanStack Start / React 19 / TypeScript
- **Styling**: Tailwind CSS & Lucide Icons
- **Database & Auth**: Supabase (PostgreSQL)
- **Deployment**: Vercel / Cloudflare

## Getting Started

### 1. Prerequisites

- [Bun](https://bun.sh/) (or Node.js 20+)
- A [Supabase](https://supabase.com/) project

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
```

### 3. Database Schema

Execute the following SQL in your Supabase SQL editor:

```sql
create table if not exists public.doc_batches (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'masters',
  mail_date date not null,
  batch_name text not null,
  submission_from date not null,
  submission_to date not null,
  candidates_count integer not null default 0,
  wait_time_months numeric(5, 1) not null default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.doc_batches enable row level security;

-- Public can read all batches
create policy "Allow public read access"
  on public.doc_batches
  for select
  to public
  using (true);

-- Authenticated admins can manage batches
create policy "Allow authenticated admin insert"
  on public.doc_batches
  for insert
  to authenticated
  with check (true);

create policy "Allow authenticated admin update"
  on public.doc_batches
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Allow authenticated admin delete"
  on public.doc_batches
  for delete
  to authenticated
  using (true);
```

### 4. Development

```bash
# Install dependencies
bun install

# Start local development server
bun dev
```

The app will be running at `http://localhost:8080/`.

### 5. Build for Production

```bash
bun run build
```
