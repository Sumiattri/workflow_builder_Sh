import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runs } from "@trigger.dev/sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Cancel an in-progress run: cancel the Trigger.dev run + reconcile the DB. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const runId = body?.runId as string | undefined;
  const triggerRunId = body?.triggerRunId as string | undefined;
  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  const run = await prisma.run.findFirst({
    where: { id: runId, userId },
    include: { nodeRuns: true },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (triggerRunId) {
    try {
      await runs.cancel(triggerRunId);
    } catch {
      /* run may have already finished; reconcile DB regardless */
    }
  }

  // mark still-running/pending nodes as skipped, finalize the run
  await prisma.nodeRun.updateMany({
    where: { runId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "SKIPPED", error: "Canceled by user", finishedAt: new Date() },
  });

  const succeeded = run.nodeRuns.filter((n) => n.status === "SUCCESS").length;
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: succeeded > 0 ? "PARTIAL" : "FAILED",
      finishedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
    },
  });

  return NextResponse.json({ ok: true });
}
