import { task, tasks, logger, metadata, runs } from "@trigger.dev/sdk";
import { prisma } from "@/lib/prisma";
import { directDependencies } from "@/lib/dag";
import {
  computeLocalOutputs,
  resolveNodeInputs,
  type OutputsByNode,
} from "@/lib/resolve";
import {
  type CropImageData,
  type FlowNode,
  type GeminiData,
  type WorkflowGraph,
} from "@/lib/types";
import type { cropImageTask } from "./cropImage";
import type { geminiTask } from "./gemini";

export interface OrchestratorPayload {
  runId: string;
  workflowId: string;
  graph: WorkflowGraph;
  targetNodeIds: string[];
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v) return [v];
  return [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Await a child task run by polling (NOT triggerAndWait / wait.*). Trigger.dev v4
 * forbids parallel waitpoints (`Promise.all` around wait functions), so we poll
 * with setTimeout instead — that lets independent nodes fan out concurrently.
 */
async function waitForRun<T>(runId: string): Promise<T> {
  for (let i = 0; i < 720; i++) {
    const r = await runs.retrieve(runId);
    if (r.isCompleted) {
      if (r.isFailed) {
        const msg = (r.error as { message?: string } | undefined)?.message;
        throw new Error(msg ?? "Child task failed");
      }
      return r.output as T;
    }
    await sleep(800);
  }
  throw new Error("Child task timed out");
}

/**
 * Walk the DAG and execute the target node set. Each node awaits only its
 * direct upstream dependencies; independent nodes run concurrently. Executable
 * nodes (crop-image, gemini) run as their own Trigger.dev tasks; request-inputs
 * and response resolve locally.
 */
export const runWorkflowTask = task({
  id: "run-workflow",
  maxDuration: 300,
  run: async (payload: OrchestratorPayload) => {
    const { runId, workflowId, graph, targetNodeIds } = payload;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(targetNodeIds)) {
      throw new Error(
        "Invalid orchestrator payload: missing graph.nodes or targetNodeIds."
      );
    }
    const runSet = new Set(targetNodeIds);
    const byId = new Map(graph.nodes.map((n) => [n.id, n as FlowNode]));
    const outputs: OutputsByNode = {};

    // ── Prefill outputs for nodes NOT in the run set (cached deps) ──
    const cachedRuns = await prisma.nodeRun.findMany({
      where: { run: { workflowId }, status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
    });
    const cachedByNode = new Map<string, unknown>();
    for (const nr of cachedRuns) {
      if (!cachedByNode.has(nr.nodeId)) cachedByNode.set(nr.nodeId, nr.output);
    }
    for (const node of graph.nodes) {
      if (runSet.has(node.id)) continue;
      const local = computeLocalOutputs(node);
      if (local) {
        outputs[node.id] = local;
      } else if (cachedByNode.has(node.id)) {
        outputs[node.id] = cachedByNode.get(node.id) as Record<string, unknown>;
      }
    }

    // map nodeId -> NodeRun.id (created by the API route)
    const nodeRunRows = await prisma.nodeRun.findMany({ where: { runId } });
    const nodeRunId = new Map(nodeRunRows.map((r) => [r.nodeId, r.id]));

    // publish initial per-node status to run metadata (streamed via Realtime)
    for (const id of targetNodeIds) metadata.set(id, { status: "PENDING" });

    const memo = new Map<string, Promise<Record<string, unknown>>>();

    const execute = async (
      node: FlowNode
    ): Promise<Record<string, unknown>> => {
      const deps = directDependencies(graph.edges, node.id).filter((d) =>
        runSet.has(d)
      );
      // await ONLY direct upstream deps that are part of this run
      await Promise.all(deps.map((d) => run(d)));

      const nrId = nodeRunId.get(node.id);
      const startedAt = new Date();
      metadata.set(node.id, { status: "RUNNING" });
      if (nrId) {
        await prisma.nodeRun.update({
          where: { id: nrId },
          data: { status: "RUNNING", startedAt },
        });
      }

      try {
        const inputs = resolveNodeInputs(graph, node, outputs);
        let output: Record<string, unknown>;

        switch (node.type) {
          case "request-inputs": {
            output = computeLocalOutputs(node) ?? {};
            break;
          }
          case "crop-image": {
            const fallback = (node.data as CropImageData).values;
            const handle = await tasks.trigger<typeof cropImageTask>(
              "crop-image",
              {
                imageUrl: String(inputs.inputImage ?? fallback.inputImage ?? ""),
                x: num(inputs.x, fallback.x),
                y: num(inputs.y, fallback.y),
                width: num(inputs.width, fallback.width),
                height: num(inputs.height, fallback.height),
              }
            );
            const out = await waitForRun<{ outputUrl: string }>(handle.id);
            output = { output: out.outputUrl };
            break;
          }
          case "gemini": {
            const data = node.data as GeminiData;
            const handle = await tasks.trigger<typeof geminiTask>("gemini", {
              model: data.model,
              prompt: String(inputs.prompt ?? data.values.prompt ?? ""),
              systemPrompt: String(
                inputs.systemPrompt ?? data.values.systemPrompt ?? ""
              ),
              images: asArray(inputs.image),
              videos: asArray(inputs.video),
              audios: asArray(inputs.audio),
              files: asArray(inputs.file),
              settings: data.settings,
            });
            const out = await waitForRun<{ text: string }>(handle.id);
            output = { response: out.text };
            break;
          }
          case "response": {
            output = { result: inputs.result };
            break;
          }
          default:
            throw new Error(`Node type "${node.type}" is not executable.`);
        }

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        metadata.set(
          node.id,
          JSON.parse(JSON.stringify({ status: "SUCCESS", output, durationMs }))
        );
        if (nrId) {
          await prisma.nodeRun.update({
            where: { id: nrId },
            data: {
              status: "SUCCESS",
              output: output as object,
              inputs: inputs as object,
              finishedAt,
              durationMs,
            },
          });
        }
        outputs[node.id] = output;
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        metadata.set(node.id, { status: "FAILED", error: message, durationMs });
        if (nrId) {
          await prisma.nodeRun.update({
            where: { id: nrId },
            data: {
              status: "FAILED",
              error: message,
              finishedAt,
              durationMs,
            },
          });
        }
        throw err;
      }
    };

    const run = (id: string): Promise<Record<string, unknown>> => {
      if (!memo.has(id)) {
        const node = byId.get(id);
        if (!node) {
          memo.set(id, Promise.resolve({}));
        } else {
          memo.set(id, execute(node));
        }
      }
      return memo.get(id)!;
    };

    // Kick off every targeted node concurrently; memoization + per-node
    // dependency awaits give correct fan-out.
    const results = await Promise.allSettled(
      targetNodeIds.map((id) => run(id))
    );

    // Mark any node still PENDING (skipped due to an upstream failure)
    await prisma.nodeRun.updateMany({
      where: { runId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    const skipped = await prisma.nodeRun.findMany({
      where: { runId, status: "SKIPPED" },
      select: { nodeId: true },
    });
    for (const s of skipped) metadata.set(s.nodeId, { status: "SKIPPED" });

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    const status =
      failed === 0 ? "SUCCESS" : succeeded === 0 ? "FAILED" : "PARTIAL";

    const run0 = await prisma.run.findUnique({ where: { id: runId } });
    const finishedAt = new Date();
    await prisma.run.update({
      where: { id: runId },
      data: {
        status,
        finishedAt,
        durationMs: run0
          ? finishedAt.getTime() - run0.startedAt.getTime()
          : null,
      },
    });

    logger.info("Workflow run complete", { runId, status });
    return { runId, status };
  },
});
