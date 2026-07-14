# NextFlow

A pixel-perfect-minded clone of the [Galaxy.ai](https://galaxy.ai) workflow builder, focused exclusively on **LLM workflows**. Built with React Flow for the canvas, Google Gemini for LLM execution, and **Trigger.dev for all node execution**.

Three surfaces only — Clerk auth, a Dashboard, and the Workflow Canvas. There is no marketing/landing page; unauthenticated traffic is redirected straight to Clerk.

---

## ⚠️ Before you submit — fill in your LinkedIn URL

Every page logs exactly once on its initial client render:

```
[NextFlow] Candidate LinkedIn: <your-url>
```

Set this in `.env`:

```
NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL="https://www.linkedin.com/in/your-handle"
```

It currently defaults to a `REPLACE_ME` placeholder.

---

## Tech stack

Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL (Neon) · Prisma · Clerk · React Flow (`@xyflow/react`) · **Trigger.dev** · Transloadit · FFmpeg (via Trigger.dev) · Tailwind · Zustand · Zod · `@google/generative-ai` · Lucide React.

## Setup

1. **Install**

   ```bash
   npm install        # also runs `prisma generate`
   ```

2. **Environment** — copy and fill in:

   ```bash
   cp .env.example .env
   ```

   Create free accounts and paste the keys:

   - **Clerk** — https://clerk.com (publishable + secret key)
   - **Neon** — https://neon.tech (`DATABASE_URL`)
   - **Google AI Studio** — https://aistudio.google.com/apikey (`GOOGLE_GENERATIVE_AI_API_KEY`)
   - **Trigger.dev** — https://trigger.dev (`TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`)
   - **Transloadit** — https://transloadit.com (`NEXT_PUBLIC_TRANSLOADIT_KEY`, `TRANSLOADIT_SECRET`)
   - **Your LinkedIn URL** — `NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL`

3. **Database** — push the Prisma schema to Neon:

   ```bash
   npm run db:push
   ```

4. **Run the app + Trigger.dev** (two terminals):

   ```bash
   npm run dev          # Next.js
   npm run trigger:dev  # Trigger.dev worker (required for node execution)
   ```

   > **All node execution runs through Trigger.dev.** Without the worker running (or a deployed Trigger.dev project), runs will be created but fail to start. Deploy tasks with `npm run trigger:deploy`.

## How execution works

- **Request-Inputs** and **Response** are local-only — they resolve field values and capture the final result. They are pre-placed on every new canvas and cannot be deleted.
- **Crop Image** and **Gemini 3.1 Pro** each run as their own Trigger.dev task.
- A single **orchestrator** Trigger.dev task (`src/trigger/orchestrator.ts`) walks the DAG: every node awaits **only its direct upstream dependencies**, and independent nodes fan out concurrently via `triggerAndWait`. A finished node releases its dependents immediately — it never blocks on unrelated siblings.
- The **Crop Image** task awaits **30+ seconds** before returning (mandatory, `wait.for({ seconds: 31 })`), then crops with FFmpeg and stores the result via Transloadit.
- Per-node status is published to the orchestrator run's **metadata** (`metadata.set(nodeId, …)`) and streamed to the browser via **Trigger.dev Realtime** (`useRealtimeRun` + a per-run public access token minted in the runs API) — this drives the **pulsating glow** and inline outputs with no polling. Node runs are also persisted to Postgres for history. Every run (full / multi-select / single) creates a history entry.

## Selective execution

- **Run** (top-right) executes the whole workflow.
- Select one node → its header **Run** button (or "Run selected (1)") runs just that node (`SINGLE`).
- Multi-select (⌘/Shift-click) → **Run selected (n)** runs that subset (`PARTIAL`).

Upstream outputs not in the run set are taken from the latest successful run (cache).

## The required sample workflow

The exact 7-node sample from the spec (Request-Inputs → 2× Crop Image + 3× Gemini → Response,
wired as specified) ships as a **System Workflow** — open the Dashboard and click the
**Trial Task Workflow** card under "System Workflows" to create your own editable copy
(`src/lib/system-workflows.ts`). System workflows are static templates visible to every user.

It's also available as `samples/trial-task-workflow.nextflow.json` for the **Import** button
(top-right of the canvas). Either way, upload a product image into the `image_field` and hit **Run**.

Expected DAG behavior: Crop #1, Crop #2 and Gemini #1 start at T=0; Gemini #2 starts the moment
Gemini #1 finishes (without waiting on the crops); the final Gemini waits for both crops + Gemini #2.

## Project structure

```
src/
  app/
    layout.tsx              ClerkProvider + per-page LinkedIn console.log
    dashboard/              workflow list (create / open / rename / delete)
    workflow/[id]/          the builder page
    sign-in, sign-up/       Clerk
    api/
      workflows/            CRUD + runs (create run → fire orchestrator)
      runs/[id]/            run detail (polled for glow)
      transloadit/          signed upload params
  components/
    canvas/                 ReactFlow canvas, nodes, edges, picker, toolbar, history
    dashboard/              dashboard UI
  lib/                      types, store (Zustand), dag, resolve, node-defs, validation
  trigger/                  Trigger.dev tasks: orchestrator, cropImage, gemini
prisma/schema.prisma        Workflow / Run / NodeRun
```

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run trigger:dev` | Trigger.dev worker (needed to execute nodes) |
| `npm run build` | `prisma generate` + production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run db:push` | push Prisma schema to Postgres |
| `npm run trigger:deploy` | deploy Trigger.dev tasks |

## Deploy (Vercel)

1. Push to GitHub, import into Vercel.
2. Add all `.env` variables to the Vercel project.
3. Set the build command to `npm run build` (it runs `prisma generate`).
4. Deploy your Trigger.dev tasks separately with `npm run trigger:deploy`.
