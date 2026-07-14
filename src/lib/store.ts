"use client";
import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import {
  type NodeData,
  type NodeRunStatus,
  type NodeType,
  type WorkflowGraph,
  parseHandle,
  inHandle,
  outHandle,
} from "./types";
import { defaultData, getPort } from "./node-defs";
import { validateConnection, dagLevels } from "./dag";

export type AppNode = Node<NodeData, NodeType>;
export type AppEdge = Edge;

export interface NodeRuntime {
  status: NodeRunStatus;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

interface Snapshot {
  nodes: AppNode[];
  edges: AppEdge[];
}

interface WorkflowState {
  workflowId: string | null;
  workflowName: string;
  nodes: AppNode[];
  edges: AppEdge[];
  selectedIds: string[];
  dirty: boolean;

  // run state
  runId: string | null;
  isRunning: boolean;
  runtime: Record<string, NodeRuntime>;

  // history (undo/redo)
  past: Snapshot[];
  future: Snapshot[];

  // ── lifecycle ──
  loadWorkflow: (id: string, name: string, graph: WorkflowGraph) => void;
  setName: (name: string) => void;
  toGraph: () => WorkflowGraph;
  markClean: () => void;

  // ── canvas mutations ──
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (conn: Connection) => boolean;
  isValidConnection: (conn: Connection | Edge) => boolean;
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  removeNodes: (ids: string[]) => void;
  updateNodeData: (id: string, patch: Partial<NodeData>) => void;
  setSelected: (ids: string[]) => void;
  setViewport: (vp: Viewport) => void;

  // ── selection / clipboard / layout ──
  selectAll: () => void;
  deselectAll: () => void;
  duplicateNodes: (ids: string[], withEdges: boolean) => void;
  copyNodes: (ids: string[]) => void;
  pasteNodes: () => void;
  autoArrange: () => void;

  // ── undo / redo ──
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ── run state ──
  setRun: (runId: string | null) => void;
  setNodeRuntime: (nodeId: string, rt: Partial<NodeRuntime>) => void;
  resetRuntime: () => void;
  setRunning: (running: boolean) => void;
}

const MAX_HISTORY = 50;
const UNDELETABLE: NodeType[] = ["request-inputs", "response"];

// in-memory clipboard for copy/paste (not persisted)
let clipboard: Snapshot | null = null;

/** Clone a set of nodes (+ optionally edges between them) with fresh ids and an offset. */
function cloneSubset(
  nodes: AppNode[],
  edges: AppEdge[],
  ids: string[],
  withEdges: boolean,
  offset: number
): { nodes: AppNode[]; edges: AppEdge[] } {
  const idSet = new Set(ids);
  // singletons (Request-Inputs / Response) can't be duplicated
  const source = nodes.filter(
    (n) => idSet.has(n.id) && !UNDELETABLE.includes(n.type as NodeType)
  );
  const idMap = new Map<string, string>();
  const cloned: AppNode[] = source.map((n) => {
    const nid = `${n.type}_${nanoid(6)}`;
    idMap.set(n.id, nid);
    return {
      ...structuredClone(n),
      id: nid,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: true,
    };
  });
  const clonedEdges: AppEdge[] = withEdges
    ? edges
        .filter(
          (e) => idMap.has(e.source) && idMap.has(e.target)
        )
        .map((e) => ({
          ...e,
          id: `e_${nanoid(8)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }))
    : [];
  return { nodes: cloned, edges: clonedEdges };
}

function snapshot(s: Pick<WorkflowState, "nodes" | "edges">): Snapshot {
  return {
    nodes: structuredClone(s.nodes),
    edges: structuredClone(s.edges),
  };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: null,
  workflowName: "Untitled Workflow",
  nodes: [],
  edges: [],
  selectedIds: [],
  dirty: false,
  runId: null,
  isRunning: false,
  runtime: {},
  past: [],
  future: [],

  loadWorkflow: (id, name, graph) => {
    const nodes: AppNode[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
      deletable: n.deletable ?? !UNDELETABLE.includes(n.type),
    }));
    const edges: AppEdge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
      type: "animated",
    }));
    set({
      workflowId: id,
      workflowName: name,
      nodes,
      edges,
      selectedIds: [],
      dirty: false,
      past: [],
      future: [],
      runId: null,
      runtime: {},
      isRunning: false,
    });
  },

  setName: (name) => set({ workflowName: name, dirty: true }),

  toGraph: () => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as NodeType,
        position: n.position,
        data: n.data,
        deletable: n.deletable,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? "",
        target: e.target,
        targetHandle: e.targetHandle ?? "",
      })),
    };
  },

  markClean: () => set({ dirty: false }),

  onNodesChange: (changes) => {
    // block removal of undeletable nodes
    const filtered = changes.filter((c) => {
      if (c.type === "remove") {
        const node = get().nodes.find((n) => n.id === c.id);
        if (node && UNDELETABLE.includes(node.type as NodeType)) return false;
      }
      return true;
    });
    const structural = filtered.some(
      (c) => c.type === "remove" || c.type === "add"
    );
    set((s) => ({
      nodes: applyNodeChanges(filtered, s.nodes),
      dirty: true,
      ...(structural
        ? { past: [...s.past, snapshot(s)].slice(-MAX_HISTORY), future: [] }
        : {}),
    }));
  },

  onEdgesChange: (changes) => {
    const structural = changes.some(
      (c) => c.type === "remove" || c.type === "add"
    );
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: true,
      ...(structural
        ? { past: [...s.past, snapshot(s)].slice(-MAX_HISTORY), future: [] }
        : {}),
    }));
  },

  isValidConnection: (conn) => {
    const sh = parseHandle(conn.sourceHandle);
    const th = parseHandle(conn.targetHandle);
    if (!sh || !th || sh.dir !== "out" || th.dir !== "in") return false;
    if (!conn.source || !conn.target) return false;
    const graph = get().toGraph();
    return validateConnection(graph, {
      source: conn.source,
      sourceHandlePortId: sh.portId,
      target: conn.target,
      targetHandlePortId: th.portId,
    }).ok;
  },

  onConnect: (conn) => {
    if (!get().isValidConnection(conn)) return false;
    const sh = parseHandle(conn.sourceHandle)!;
    const th = parseHandle(conn.targetHandle)!;
    const tgtNode = get().nodes.find((n) => n.id === conn.target)!;
    const tgtPort = getPort(tgtNode, "in", th.portId);

    set((s) => {
      let edges = s.edges;
      // single-connection inputs: replace existing edge on this handle
      if (!tgtPort?.multi) {
        edges = edges.filter(
          (e) =>
            !(e.target === conn.target && e.targetHandle === conn.targetHandle)
        );
      }
      const newEdge: AppEdge = {
        id: `e_${nanoid(8)}`,
        source: conn.source!,
        sourceHandle: conn.sourceHandle!,
        target: conn.target!,
        targetHandle: conn.targetHandle!,
        type: "animated",
      };
      return {
        edges: [...edges, newEdge],
        dirty: true,
        past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
        future: [],
      };
    });
    return true;
  },

  addNode: (type, position) => {
    const id = `${type}_${nanoid(6)}`;
    const node: AppNode = {
      id,
      type,
      position,
      data: defaultData(type),
      deletable: !UNDELETABLE.includes(type),
    };
    set((s) => ({
      nodes: [...s.nodes, node],
      dirty: true,
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      future: [],
    }));
    return id;
  },

  removeNodes: (ids) => {
    const removable = ids.filter((id) => {
      const n = get().nodes.find((x) => x.id === id);
      return n && !UNDELETABLE.includes(n.type as NodeType);
    });
    if (removable.length === 0) return;
    const remset = new Set(removable);
    set((s) => ({
      nodes: s.nodes.filter((n) => !remset.has(n.id)),
      edges: s.edges.filter(
        (e) => !remset.has(e.source) && !remset.has(e.target)
      ),
      dirty: true,
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  updateNodeData: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } as NodeData } : n
      ),
      dirty: true,
    }));
  },

  setSelected: (ids) => set({ selectedIds: ids }),

  setViewport: () => {
    /* viewport persisted via React Flow's onMoveEnd if desired; no-op for now */
  },

  selectAll: () =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: true })),
      selectedIds: s.nodes.map((n) => n.id),
    })),

  deselectAll: () =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: false })),
      selectedIds: [],
    })),

  duplicateNodes: (ids, withEdges) => {
    set((s) => {
      const { nodes: cloned, edges: clonedEdges } = cloneSubset(
        s.nodes,
        s.edges,
        ids,
        withEdges,
        40
      );
      if (cloned.length === 0) return {};
      return {
        nodes: [
          ...s.nodes.map((n) => ({ ...n, selected: false })),
          ...cloned,
        ],
        edges: [...s.edges, ...clonedEdges],
        selectedIds: cloned.map((n) => n.id),
        dirty: true,
        past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
        future: [],
      };
    });
  },

  copyNodes: (ids) => {
    const s = get();
    const { nodes, edges } = cloneSubset(s.nodes, s.edges, ids, true, 0);
    clipboard = nodes.length ? { nodes, edges } : null;
  },

  pasteNodes: () => {
    if (!clipboard) return;
    const ids = clipboard.nodes.map((n) => n.id);
    // re-clone from the clipboard snapshot so repeated pastes get fresh ids
    set((s) => {
      const { nodes: cloned, edges: clonedEdges } = cloneSubset(
        clipboard!.nodes,
        clipboard!.edges,
        ids,
        true,
        40
      );
      if (cloned.length === 0) return {};
      return {
        nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...cloned],
        edges: [...s.edges, ...clonedEdges],
        selectedIds: cloned.map((n) => n.id),
        dirty: true,
        past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
        future: [],
      };
    });
  },

  autoArrange: () => {
    const graph = get().toGraph();
    const levels = dagLevels(graph);
    if (levels.length === 0) return;
    const COL = 380;
    const ROW = 280;
    const pos = new Map<string, { x: number; y: number }>();
    levels.forEach((ids, col) =>
      ids.forEach((id, row) => pos.set(id, { x: col * COL, y: row * ROW }))
    );
    set((s) => ({
      nodes: s.nodes.map((n) =>
        pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n
      ),
      dirty: true,
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  pushHistory: () =>
    set((s) => ({
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      future: [],
    })),

  undo: () => {
    const { past } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set((s) => ({
      nodes: prev.nodes,
      edges: prev.edges,
      past: s.past.slice(0, -1),
      future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
      dirty: true,
    }));
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return;
    const next = future[0]!;
    set((s) => ({
      nodes: next.nodes,
      edges: next.edges,
      future: s.future.slice(1),
      past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
      dirty: true,
    }));
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  setRun: (runId) => set({ runId }),
  setNodeRuntime: (nodeId, rt) =>
    set((s) => ({
      runtime: {
        ...s.runtime,
        [nodeId]: { ...(s.runtime[nodeId] ?? { status: "PENDING" }), ...rt },
      },
    })),
  resetRuntime: () => set({ runtime: {} }),
  setRunning: (running) => set({ isRunning: running }),
}));

// re-export handle helpers for convenience in components
export { inHandle, outHandle, parseHandle };
