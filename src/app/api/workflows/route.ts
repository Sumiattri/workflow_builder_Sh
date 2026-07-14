import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createWorkflowSchema } from "@/lib/validation";
import { defaultData } from "@/lib/node-defs";
import type { WorkflowListItem } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** Two pre-placed, non-deletable nodes seeded into every new workflow. */
function makeInitialGraph(): Prisma.InputJsonValue {
  return {
    nodes: [
      {
        id: "request-inputs_main",
        type: "request-inputs",
        position: { x: 0, y: 120 },
        data: defaultData("request-inputs"),
        deletable: false,
      },
      {
        id: "response_main",
        type: "response",
        position: { x: 1000, y: 200 },
        data: defaultData("response"),
        deletable: false,
      },
    ],
    edges: [],
  } as unknown as Prisma.InputJsonValue;
}

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.workflow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { runs: { where: { status: "RUNNING" } } },
      },
    },
  });

  const items: WorkflowListItem[] = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    hasActiveRun: w._count.runs > 0,
  }));

  return NextResponse.json(items);
}

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = createWorkflowSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const graph: Prisma.InputJsonValue =
    parsed.data.graph != null
      ? (parsed.data.graph as unknown as Prisma.InputJsonValue)
      : makeInitialGraph();

  const created = await prisma.workflow.create({
    data: {
      userId,
      name: parsed.data.name ?? "Untitled Workflow",
      graph,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
