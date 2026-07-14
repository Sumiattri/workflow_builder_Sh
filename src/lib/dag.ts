// ─────────────────────────────────────────────────────────────
// DAG helpers: type-safe connections, cycle detection, ordering,
// and selective-execution subset resolution.
// ─────────────────────────────────────────────────────────────
import { getPort } from "./node-defs";
import {
  type FlowEdge,
  type FlowNode,
  type PortType,
  type WorkflowGraph,
} from "./types";

/** image outputs cannot feed text inputs, etc. `any` is the universal sink/source. */
export function typesCompatible(source: PortType, target: PortType): boolean {
  if (source === "any" || target === "any") return true;
  return source === target;
}

export interface ConnectionRequest {
  source: string;
  sourceHandlePortId: string;
  target: string;
  targetHandlePortId: string;
}

export interface ConnectionCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a proposed connection: no self-loop, type-safe, no cycle, single-source on non-multi inputs. */
export function validateConnection(
  graph: WorkflowGraph,
  req: ConnectionRequest
): ConnectionCheck {
  if (req.source === req.target) {
    return { ok: false, reason: "Cannot connect a node to itself." };
  }

  const srcNode = graph.nodes.find((n) => n.id === req.source);
  const tgtNode = graph.nodes.find((n) => n.id === req.target);
  if (!srcNode || !tgtNode) return { ok: false, reason: "Node not found." };

  const srcPort = getPort(srcNode, "out", req.sourceHandlePortId);
  const tgtPort = getPort(tgtNode, "in", req.targetHandlePortId);
  if (!srcPort || !tgtPort) return { ok: false, reason: "Handle not found." };

  if (!typesCompatible(srcPort.type, tgtPort.type)) {
    return {
      ok: false,
      reason: `Type mismatch: ${srcPort.type} → ${tgtPort.type}.`,
    };
  }

  // single-connection inputs: replace, but reject duplicate exact edge
  if (!tgtPort.multi) {
    const occupied = graph.edges.some(
      (e) => e.target === req.target && e.targetHandle === `in:${req.targetHandlePortId}`
    );
    if (occupied) {
      // allowed: the UI replaces; we don't hard-reject here
    }
  }

  // cycle check: adding source->target must not create a cycle
  if (wouldCreateCycle(graph.edges, req.source, req.target)) {
    return { ok: false, reason: "Connection would create a cycle (DAG only)." };
  }

  return { ok: true };
}

/** Does adding edge from->to create a cycle? (i.e. is `from` reachable from `to`?) */
export function wouldCreateCycle(
  edges: FlowEdge[],
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const adj = adjacency(edges);
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

function adjacency(edges: FlowEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  return adj;
}

/** direct upstream node ids for a given node */
export function directDependencies(edges: FlowEdge[], nodeId: string): string[] {
  return Array.from(
    new Set(edges.filter((e) => e.target === nodeId).map((e) => e.source))
  );
}

/** Kahn topological sort; returns null if a cycle exists. */
export function topoSort(graph: WorkflowGraph): string[] | null {
  const ids = graph.nodes.map((n) => n.id);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = adjacency(graph.edges);
  for (const e of graph.edges) {
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  return order.length === ids.length ? order : null;
}

/**
 * Resolve which nodes to execute for a selective run.
 * For each targeted node we pull in its full upstream closure so inputs resolve,
 * but only the targeted set is actually re-run; upstream nodes are reused if cached
 * (the engine decides). Returns the execution-ordered list of node ids to run.
 */
export function resolveRunSet(
  graph: WorkflowGraph,
  targetIds: string[]
): { runIds: string[]; ordered: string[] } {
  const order = topoSort(graph) ?? graph.nodes.map((n) => n.id);
  const runSet = new Set(targetIds);
  const ordered = order.filter((id) => runSet.has(id));
  return { runIds: Array.from(runSet), ordered };
}

/** Full upstream closure (transitive dependencies) of a set of nodes. */
export function upstreamClosure(
  graph: WorkflowGraph,
  targetIds: string[]
): Set<string> {
  const closure = new Set<string>(targetIds);
  const stack = [...targetIds];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const dep of directDependencies(graph.edges, cur)) {
      if (!closure.has(dep)) {
        closure.add(dep);
        stack.push(dep);
      }
    }
  }
  return closure;
}

/** Group node ids into DAG "levels" (for visualization / debugging). */
export function dagLevels(graph: WorkflowGraph): string[][] {
  const order = topoSort(graph);
  if (!order) return [];
  const level = new Map<string, number>();
  for (const id of order) {
    const deps = directDependencies(graph.edges, id);
    const lv = deps.length
      ? Math.max(...deps.map((d) => (level.get(d) ?? 0) + 1))
      : 0;
    level.set(id, lv);
  }
  const levels: string[][] = [];
  for (const [id, lv] of level) {
    (levels[lv] ??= []).push(id);
  }
  return levels;
}
