"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { useWorkflowStore } from "@/lib/store";
import { type NodeRunStatus, type RunDTO, type RunScope } from "@/lib/types";

const TRIGGER_BASE_URL =
  process.env.NEXT_PUBLIC_TRIGGER_API_URL ?? "https://api.trigger.dev";

/** Trigger.dev run statuses that mean the run is over. */
const FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
]);

/** Debounced autosave of the current graph + name. */
export function useWorkflowSync(workflowId: string, enabled = true) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const name = useWorkflowStore((s) => s.workflowName);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const { toGraph, workflowName, markClean } = useWorkflowStore.getState();
    setSaving(true);
    try {
      await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: toGraph(), name: workflowName }),
      });
      markClean();
    } catch {
      /* keep dirty; will retry on next change */
    } finally {
      setSaving(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (!enabled) return;
    if (!useWorkflowStore.getState().dirty) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [nodes, edges, name, save, enabled]);

  return { save, saving };
}

interface NodeMeta {
  status: NodeRunStatus;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

/** Mirror a node's resolved output into its node data for inline display. */
function applyInline(nodeId: string, output?: Record<string, unknown>) {
  if (!output) return;
  const { nodes, updateNodeData } = useWorkflowStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;

  if (typeof output.response === "string") {
    if (data.response !== output.response) {
      updateNodeData(nodeId, { response: output.response });
    }
  } else if (typeof output.output === "string") {
    if (data.output !== output.output) {
      updateNodeData(nodeId, { output: output.output });
    }
  } else if ("result" in output) {
    if (!sameValue(data.result, output.result)) {
      updateNodeData(nodeId, { result: output.result });
    }
  }
}

interface ActiveRun {
  runId: string;
  triggerRunId: string;
  accessToken: string;
  scope: RunScope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function applyPersistedRun(run: RunDTO): boolean {
  const store = useWorkflowStore.getState();
  store.setRun(run.id);

  for (const nr of run.nodeRuns) {
    const output = isRecord(nr.output) ? nr.output : undefined;
    store.setNodeRuntime(nr.nodeId, {
      status: nr.status,
      output,
      error: nr.error ?? undefined,
      durationMs: nr.durationMs ?? undefined,
    });
    applyInline(nr.nodeId, output);
  }

  return run.status === "RUNNING";
}

function rememberRunNodes(run: RunDTO, nodeRunIds: Record<string, string>) {
  for (const nr of run.nodeRuns) {
    if (nr.status === "PENDING" || nr.status === "RUNNING") {
      nodeRunIds[nr.nodeId] = run.id;
    }
  }
}

/**
 * Triggers a run, then subscribes to the orchestrator run via Trigger.dev
 * Realtime. Per-node status is published to the run's metadata and streamed
 * here to drive the pulsating glow + inline outputs (no polling).
 */
export function useRunner(workflowId: string, onFinished?: () => void) {
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeRuns, setActiveRuns] = useState<Record<string, RunScope>>({});
  const activeRunsRef = useRef<Record<string, RunScope>>({});
  const nodeRunIdsRef = useRef<Record<string, string>>({});
  const triggerRunIdsRef = useRef<Record<string, string>>({});
  const locallyCanceledRunIdsRef = useRef<Set<string>>(new Set());

  // keep onFinished stable so effects don't re-fire on every parent render
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  const setActiveRunMap = useCallback((next: Record<string, RunScope>) => {
    activeRunsRef.current = next;
    setActiveRuns(next);
    const running = Object.keys(next).length > 0;
    useWorkflowStore.getState().setRunning(running);
    setIsRunning(running);
  }, []);

  const { run: realtimeRun, error } = useRealtimeRun(active?.triggerRunId, {
    accessToken: active?.accessToken,
    baseURL: TRIGGER_BASE_URL,
    enabled: !!active,
  });

  // only apply when the run's content actually changes (the hook returns a new
  // object reference every render — writing unconditionally would loop forever)
  const lastAppliedRef = useRef<string>("");

  // stream run metadata → store
  useEffect(() => {
    if (!realtimeRun) return;
    const key = `${realtimeRun.status}|${JSON.stringify(
      realtimeRun.metadata ?? {}
    )}`;
    if (key === lastAppliedRef.current) return;
    lastAppliedRef.current = key;

    const store = useWorkflowStore.getState();
    const meta = (realtimeRun.metadata ?? {}) as unknown as Record<
      string,
      NodeMeta
    >;
    for (const [nodeId, m] of Object.entries(meta)) {
      if (!m || typeof m !== "object" || !m.status) continue;
      store.setNodeRuntime(nodeId, {
        status: m.status,
        output: m.output,
        error: m.error,
        durationMs: m.durationMs,
      });
      applyInline(nodeId, m.output);
    }

    if (FINAL_STATUSES.has(realtimeRun.status)) {
      const next = { ...activeRunsRef.current };
      if (active?.runId) {
        delete next[active.runId];
        delete triggerRunIdsRef.current[active.runId];
        for (const [nodeId, runId] of Object.entries(nodeRunIdsRef.current)) {
          if (runId === active.runId) delete nodeRunIdsRef.current[nodeId];
        }
      }
      setActiveRunMap(next);
      setActive(null);
      onFinishedRef.current?.();
    }
  }, [active?.runId, realtimeRun, setActiveRunMap]);

  // realtime connection error → stop gracefully
  useEffect(() => {
    if (error && active) {
      const next = { ...activeRunsRef.current };
      delete next[active.runId];
      delete triggerRunIdsRef.current[active.runId];
      for (const [nodeId, runId] of Object.entries(nodeRunIdsRef.current)) {
        if (runId === active.runId) delete nodeRunIdsRef.current[nodeId];
      }
      setActiveRunMap(next);
      setActive(null);
      onFinishedRef.current?.();
    }
  }, [error, active, setActiveRunMap]);

  // Page refresh recovery: realtime subscriptions are in-memory, but run
  // progress is persisted in Postgres. Restore every active run and let the
  // active-runs poller reconcile their NodeRun rows until they finalize.
  useEffect(() => {
    if (Object.keys(activeRunsRef.current).length > 0) return;

    let cancelled = false;

    const restore = async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const runs = (await res.json()) as RunDTO[];
        const runningRuns = runs.filter(
          (run) =>
            run.status === "RUNNING" &&
            !locallyCanceledRunIdsRef.current.has(run.id)
        );
        if (runningRuns.length === 0 || cancelled) return;

        const next = { ...activeRunsRef.current };
        for (const run of runningRuns) {
          const stillRunning = applyPersistedRun(run);
          if (stillRunning) {
            next[run.id] = run.scope;
            rememberRunNodes(run, nodeRunIdsRef.current);
          }
        }
        if (cancelled || Object.keys(next).length === 0) return;
        setActiveRunMap({
          ...next,
        });
      } catch {
        /* history remains the source of truth if recovery fails */
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [workflowId, setActiveRunMap]);

  useEffect(() => {
    const pollableRunIds = Object.keys(activeRuns).filter(
      (runId) => runId !== active?.runId
    );
    if (pollableRunIds.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollableIds = () =>
      Object.keys(activeRunsRef.current).filter(
        (runId) => runId !== active?.runId
      );

    const poll = async () => {
      const ids = pollableIds();
      if (ids.length === 0) return;

      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) throw new Error("Failed to refresh runs");

        const runs = (await res.json()) as RunDTO[];
        const byId = new Map(runs.map((r) => [r.id, r]));
        const next = { ...activeRunsRef.current };
        let changed = false;

        for (const runId of ids) {
          if (locallyCanceledRunIdsRef.current.has(runId)) {
            delete next[runId];
            delete triggerRunIdsRef.current[runId];
            for (const [nodeId, nodeRunId] of Object.entries(
              nodeRunIdsRef.current
            )) {
              if (nodeRunId === runId) delete nodeRunIdsRef.current[nodeId];
            }
            changed = true;
            continue;
          }

          const run = byId.get(runId);
          if (!run) continue;
          const stillRunning = applyPersistedRun(run);
          if (stillRunning) {
            rememberRunNodes(run, nodeRunIdsRef.current);
          }
          if (!stillRunning) {
            delete next[runId];
            delete triggerRunIdsRef.current[runId];
            for (const [nodeId, nodeRunId] of Object.entries(
              nodeRunIdsRef.current
            )) {
              if (nodeRunId === runId) delete nodeRunIdsRef.current[nodeId];
            }
            changed = true;
          }
        }

        if (changed) {
          setActiveRunMap(next);
          onFinishedRef.current?.();
        }
      } catch {
        /* keep polling; transient failures should not clear active UI */
      }

      if (!cancelled && pollableIds().length > 0) {
        timer = setTimeout(poll, 1200);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active?.runId, activeRuns, workflowId, setActiveRunMap]);

  const run = useCallback(
    async (scope: RunScope, targetIds: string[]) => {
      if (targetIds.length === 0) return;
      const store = useWorkflowStore.getState();

      // persist current graph so the server snapshot is up to date
      await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: store.toGraph(), name: store.workflowName }),
      });
      store.markClean();

      if (scope !== "SINGLE") {
        store.resetRuntime();
      }
      lastAppliedRef.current = "";
      targetIds.forEach((id) => store.setNodeRuntime(id, { status: "PENDING" }));

      const fail = (message: string) => {
        targetIds.forEach((id) =>
          store.setNodeRuntime(id, { status: "FAILED", error: message })
        );
        const next = { ...activeRunsRef.current };
        setActiveRunMap(next);
        setActive(null);
        onFinished?.();
      };

      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, targetNodeIds: targetIds }),
        });
        const data = await res.json();
        if (data.runId) store.setRun(data.runId);
        if (data.runId) locallyCanceledRunIdsRef.current.delete(data.runId);

        if (
          !res.ok ||
          data.started === false ||
          !data.triggerRunId ||
          !data.publicAccessToken
        ) {
          fail(data.error ?? "Failed to start run");
          return;
        }

        triggerRunIdsRef.current[data.runId] = data.triggerRunId;
        for (const nodeId of targetIds) {
          nodeRunIdsRef.current[nodeId] = data.runId;
        }
        setActiveRunMap({
          ...activeRunsRef.current,
          [data.runId]: scope,
        });
        setActive({
          runId: data.runId,
          triggerRunId: data.triggerRunId,
          accessToken: data.publicAccessToken,
          scope,
        });
      } catch (err) {
        fail(err instanceof Error ? err.message : "Run failed");
      }
    },
    [workflowId, onFinished, setActiveRunMap]
  );

  const cancel = useCallback(async (nodeId?: string) => {
    const runId =
      (nodeId ? nodeRunIdsRef.current[nodeId] : undefined) ??
      active?.runId ??
      Object.keys(activeRunsRef.current)[0];
    if (!runId) return;
    locallyCanceledRunIdsRef.current.add(runId);
    const triggerRunId =
      active?.runId === runId
        ? active?.triggerRunId
        : triggerRunIdsRef.current[runId];
    // reset UI immediately for responsiveness
    if (active?.runId === runId) setActive(null);
    const next = { ...activeRunsRef.current };
    delete next[runId];
    delete triggerRunIdsRef.current[runId];
    const canceledNodeIds = Object.entries(nodeRunIdsRef.current)
      .filter(([, nodeRunId]) => nodeRunId === runId)
      .map(([id]) => id);
    if (nodeId && canceledNodeIds.length === 0) {
      canceledNodeIds.push(nodeId);
    }
    for (const id of canceledNodeIds) {
      delete nodeRunIdsRef.current[id];
      useWorkflowStore.getState().setNodeRuntime(id, {
        status: "SKIPPED",
        error: "Canceled by user",
      });
    }
    setActiveRunMap(next);
    onFinishedRef.current?.();
    try {
      await fetch("/api/runs/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          triggerRunId,
        }),
      });
    } catch {
      /* best-effort */
    }
  }, [active, setActiveRunMap]);

  return {
    run,
    cancel,
    isRunning,
    activeRunId: active?.runId ?? Object.keys(activeRuns)[0] ?? null,
    activeScope:
      active?.scope ??
      (Object.values(activeRuns).includes("FULL")
        ? "FULL"
        : Object.values(activeRuns).includes("PARTIAL")
          ? "PARTIAL"
          : Object.values(activeRuns).includes("SINGLE")
            ? "SINGLE"
            : null),
  };
}
