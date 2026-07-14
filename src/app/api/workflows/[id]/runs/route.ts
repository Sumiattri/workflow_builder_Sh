import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { executeSchema } from "@/lib/validation";
import { NODE_TITLES } from "@/lib/node-defs";
import {
  type FlowNode,
  type NodeType,
  type RunDTO,
  type WorkflowGraph,
} from "@/lib/types";
import { auth as triggerAuth, tasks } from "@trigger.dev/sdk";
import type { runWorkflowTask } from "@/trigger/orchestrator";

export const runtime = "nodejs";

/** Build human labels like "Crop Image #1", "Gemini 3.1 Pro #2". */
function labelMap(nodes: FlowNode[]): Map<string, string> {
  const counts = new Map<NodeType, number>();
  const totals = new Map<NodeType, number>();
  for (const n of nodes) totals.set(n.type, (totals.get(n.type) ?? 0) + 1);
  const map = new Map<string, string>();
  for (const n of nodes) {
    const i = (counts.get(n.type) ?? 0) + 1;
    counts.set(n.type, i);
    const base = NODE_TITLES[n.type];
    map.set(n.id, (totals.get(n.type) ?? 1) > 1 ? `${base} #${i}` : base);
  }
  return map;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const wf = await prisma.workflow.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runs = await prisma.run.findMany({
    where: { workflowId: id },
    orderBy: { startedAt: "desc" },
    include: { nodeRuns: { orderBy: { startedAt: "asc" } } },
    take: 50,
  });

  const dto: RunDTO[] = runs.map((r) => ({
    id: r.id,
    status: r.status,
    scope: r.scope,
    durationMs: r.durationMs,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    nodeRuns: r.nodeRuns.map((nr) => ({
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
  }));

  return NextResponse.json(dto);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const wf = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { scope, targetNodeIds } = parsed.data;

  const graph = wf.graph as unknown as WorkflowGraph;
  const nodes = graph.nodes ?? [];
  const labels = labelMap(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const targets = targetNodeIds.filter((nid) => byId.has(nid));
  if (targets.length === 0) {
    return NextResponse.json({ error: "No valid target nodes" }, { status: 400 });
  }

  // create Run + NodeRun rows up front so the client can render glow immediately
  const run = await prisma.run.create({
    data: {
      workflowId: id,
      userId,
      scope,
      status: "RUNNING",
      snapshot: graph as unknown as object,
      nodeRuns: {
        create: targets.map((nid) => {
          const node = byId.get(nid)!;
          return {
            nodeId: nid,
            nodeType: node.type,
            label: labels.get(nid) ?? NODE_TITLES[node.type],
            status: "PENDING" as const,
          };
        }),
      },
    },
  });

  // fire the orchestrator (runs on Trigger.dev). On failure, fail the run.
  try {
    const start = (async () => {
      const handle = await tasks.trigger<typeof runWorkflowTask>(
        "run-workflow",
        {
          runId: run.id,
          workflowId: id,
          graph,
          targetNodeIds: targets,
        }
      );
      // public token so the browser can subscribe to this run via Realtime
      const publicAccessToken = await triggerAuth.createPublicToken({
        scopes: { read: { runs: [handle.id] } },
        expirationTime: "1h",
      });
      return { handle, publicAccessToken };
    })();

    // never hang the request: fail fast if Trigger.dev doesn't respond
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Trigger.dev did not respond in time. Check TRIGGER_SECRET_KEY / project ref."
            )
          ),
        20000
      )
    );

    const { handle, publicAccessToken } = await Promise.race([start, timeout]);
    return NextResponse.json(
      {
        runId: run.id,
        triggerRunId: handle.id,
        publicAccessToken,
        started: true,
      },
      { status: 201 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start execution";
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), durationMs: 0 },
    });
    await prisma.nodeRun.updateMany({
      where: { runId: run.id },
      data: { status: "FAILED", error: message },
    });
    return NextResponse.json(
      { runId: run.id, error: message, started: false },
      { status: 502 }
    );
  }
}
