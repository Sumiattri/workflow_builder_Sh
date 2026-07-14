import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { updateWorkflowSchema } from "@/lib/validation";
import type { WorkflowDTO, WorkflowGraph } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

interface WorkflowRow {
  id: string;
  name: string;
  graph: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(w: WorkflowRow): WorkflowDTO {
  return {
    id: w.id,
    name: w.name,
    graph: w.graph as WorkflowGraph,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export async function GET(
  _req: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      graph: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toDTO(workflow));
}

export async function PATCH(
  req: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = updateWorkflowSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Ensure ownership before mutating.
  const existing = await prisma.workflow.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Prisma.WorkflowUpdateInput = {};
  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name;
  }
  if (parsed.data.graph !== undefined) {
    data.graph = parsed.data.graph as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.workflow.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      graph: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(toDTO(updated));
}

export async function DELETE(
  _req: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.workflow.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.workflow.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
