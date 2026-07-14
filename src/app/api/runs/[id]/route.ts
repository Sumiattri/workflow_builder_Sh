import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { type RunDTO } from "@/lib/types";

export const runtime = "nodejs";

/** Single run detail — polled by the canvas to drive node glow + status. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const run = await prisma.run.findFirst({
    where: { id, userId },
    include: { nodeRuns: { orderBy: { startedAt: "asc" } } },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dto: RunDTO = {
    id: run.id,
    status: run.status,
    scope: run.scope,
    durationMs: run.durationMs,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    nodeRuns: run.nodeRuns.map((nr) => ({
      id: nr.id,
      nodeId: nr.nodeId,
      nodeType: nr.nodeType,
      label: nr.label,
      status: nr.status,
      inputs: nr.inputs,
      output: nr.output,
      error: nr.error,
      durationMs: nr.durationMs,
      startedAt: nr.startedAt?.toISOString() ?? null,
      finishedAt: nr.finishedAt?.toISOString() ?? null,
    })),
  };

  return NextResponse.json(dto);
}
