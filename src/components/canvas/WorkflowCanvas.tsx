"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Plus,
  Play,
  Clock,
  Undo2,
  Redo2,
  Minus,
  Maximize2,
  Square,
  Move,
  Copy,
  Command,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Upload,
  Download,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/lib/store";
import { cleanTemplateGraph } from "@/lib/system-workflows";
import { type NodeType, type RunScope, type WorkflowDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { exportWorkflow, importWorkflowFile } from "@/lib/io";
import { RequestInputsNode } from "./nodes/RequestInputsNode";
import { CropImageNode } from "./nodes/CropImageNode";
import { GeminiNode } from "./nodes/GeminiNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { StickyNoteNode } from "./nodes/StickyNoteNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import { NodePicker } from "./NodePicker";
import { HistoryPanel } from "./HistoryPanel";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { CanvasActionsProvider } from "./CanvasContext";
import { useRunner, useWorkflowSync } from "./hooks";

const nodeTypes: NodeTypes = {
  "request-inputs": RequestInputsNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
  "sticky-note": StickyNoteNode,
};
const edgeTypes: EdgeTypes = { animated: AnimatedEdge };

const MINIMAP_COLOR: Record<string, string> = {
  "request-inputs": "#52525b",
  "crop-image": "#10b981",
  gemini: "#6366f1",
  response: "#a1a1aa",
  "sticky-note": "#fde047",
};

function ToolbarButton({
  onClick,
  title,
  children,
  active,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700",
        active && "bg-slate-100 text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

function Flow({
  workflow,
  readOnly = false,
}: {
  workflow: WorkflowDTO;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const isValidConnection = useWorkflowStore((s) => s.isValidConnection);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelected = useWorkflowStore((s) => s.setSelected);
  const selectedIds = useWorkflowStore((s) => s.selectedIds);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const selectAll = useWorkflowStore((s) => s.selectAll);
  const deselectAll = useWorkflowStore((s) => s.deselectAll);
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);
  const copyNodes = useWorkflowStore((s) => s.copyNodes);
  const pasteNodes = useWorkflowStore((s) => s.pasteNodes);
  const autoArrange = useWorkflowStore((s) => s.autoArrange);
  const pushHistory = useWorkflowStore((s) => s.pushHistory);
  const name = useWorkflowStore((s) => s.workflowName);
  const setName = useWorkflowStore((s) => s.setName);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const { saving } = useWorkflowSync(workflow.id, !readOnly);
  const [refreshKey, setRefreshKey] = useState(0);
  const { run, cancel, isRunning, activeRunId, activeScope } = useRunner(
    workflow.id,
    () => setRefreshKey((k) => k + 1)
  );
  const canvasLocked = isRunning && activeScope !== "SINGLE";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [minimapOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClone = async () => {
    setCloning(true);
    try {
      const graph = cleanTemplateGraph(useWorkflowStore.getState().toGraph());
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflow.name, graph }),
      });
      if (!res.ok) throw new Error("Failed to clone workflow");
      const data = (await res.json()) as { id: string };
      router.push(`/workflow/${data.id}`);
    } catch {
      setCloning(false);
    }
  };

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;

      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const ids = () => useWorkflowStore.getState().selectedIds;
      const locked =
        useWorkflowStore.getState().isRunning && activeScope !== "SINGLE";

      if (meta && k === "z") {
        e.preventDefault();
        if (locked) return;
        e.shiftKey ? redo() : undo();
      } else if (meta && k === "a") {
        e.preventDefault();
        selectAll();
      } else if (meta && e.shiftKey && k === "d") {
        e.preventDefault();
        if (locked) return;
        duplicateNodes(ids(), true);
      } else if (meta && k === "d") {
        e.preventDefault();
        if (locked) return;
        duplicateNodes(ids(), false);
      } else if (meta && k === "c") {
        copyNodes(ids());
      } else if (meta && k === "v") {
        if (locked) return;
        pasteNodes();
      } else if (k === "escape") {
        deselectAll();
      } else if (e.shiftKey && k === "a") {
        e.preventDefault();
        if (locked) return;
        autoArrange();
        setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 0);
      } else if (k === "f") {
        fitView({ padding: 0.3, duration: 300 });
      } else if (k === "s") {
        setSelectionMode((m) => !m);
      } else if (k === "+" || k === "=") {
        zoomIn();
      } else if (k === "-" || k === "_") {
        zoomOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selectAll,
    deselectAll,
    duplicateNodes,
    copyNodes,
    pasteNodes,
    autoArrange,
    zoomIn,
    zoomOut,
    fitView,
    readOnly,
    activeScope,
  ]);

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) =>
      setSelected(params.nodes.map((n) => n.id)),
    [setSelected]
  );

  const handleAdd = (type: NodeType) => {
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNode(type, pos);
  };

  const runFull = () => {
    // sticky notes are annotations — never part of a run
    const ids = useWorkflowStore
      .getState()
      .nodes.filter((n) => n.type !== "sticky-note")
      .map((n) => n.id);
    run("FULL", ids);
    setHistoryOpen(true);
  };

  const runSelection = () => {
    const targets = selectedIds.filter((id) => {
      const n = useWorkflowStore.getState().nodes.find((x) => x.id === id);
      return n && n.type !== "sticky-note";
    });
    if (targets.length === 0) return;
    const scope: RunScope = targets.length === 1 ? "SINGLE" : "PARTIAL";
    run(scope, targets);
    setHistoryOpen(true);
  };

  const handleImport = async (file: File) => {
    try {
      const { name: n, graph } = await importWorkflowFile(file);
      loadWorkflow(workflow.id, n, graph);
      setName(n);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Invalid workflow file");
    }
  };

  return (
    <CanvasActionsProvider
      value={{
        runNodes: (ids, scope) => run(scope, ids),
        cancel,
        isRunning,
        activeRunId,
        activeScope,
        readOnly,
      }}
    >
      <div className="flex h-full w-full bg-canvas">
        <div className="relative flex-1">
          {/* ── top-left: name pill ── */}
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-2xl border border-node-border bg-white px-3 py-2.5 shadow-md">
            <Link
              href="/dashboard"
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={readOnly}
              className="w-52 bg-transparent text-[17px] font-bold tracking-tight text-slate-900 outline-none"
            />
            {!readOnly && saving && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
            )}
          </div>

          {/* ── top-right: io / run / history (or Clone for templates) ── */}
          <div className="absolute right-5 top-5 z-20 flex items-center gap-2.5">
            {readOnly ? (
              <button
                onClick={handleClone}
                disabled={cloning}
                className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-[14px] font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {cloning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Clone Workflow
              </button>
            ) : (
              <>
                <div className="flex items-center gap-1 rounded-xl border border-node-border bg-white px-1.5 py-1 shadow-sm">
              <button
                onClick={() =>
                  exportWorkflow(name, useWorkflowStore.getState().toGraph())
                }
                title="Export JSON"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={canvasLocked}
                title="Import JSON"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImport(f);
                  e.target.value = "";
                }}
              />
            </div>

            {selectedIds.length > 1 && (
              <button
                onClick={runSelection}
                disabled={isRunning}
                className="flex items-center gap-1.5 rounded-xl border border-node-border bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Run selected ({selectedIds.length})
              </button>
            )}

            {isRunning && activeScope === "FULL" ? (
              <button
                onClick={() => cancel()}
                title="Cancel run"
                className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-3.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-red-600"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancel
              </button>
            ) : (
              <button
                onClick={runFull}
                disabled={isRunning}
                title="Run workflow"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                <Play className="h-5 w-5 fill-white" />
              </button>
            )}

            <button
              onClick={() => setHistoryOpen((o) => !o)}
              title="Run history"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border border-node-border shadow-sm transition",
                historyOpen
                  ? "bg-indigo-50 text-indigo-600"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              )}
            >
                  <Clock className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onNodeDragStart={() => !readOnly && !canvasLocked && pushHistory()}
            defaultEdgeOptions={{ type: "animated" }}
            deleteKeyCode={readOnly || canvasLocked ? null : ["Delete", "Backspace"]}
            multiSelectionKeyCode={["Meta", "Shift"]}
            panActivationKeyCode="Space"
            nodesDraggable={!readOnly && !canvasLocked}
            nodesConnectable={!readOnly && !canvasLocked}
            edgesReconnectable={!readOnly && !canvasLocked}
            selectionOnDrag={!readOnly && !canvasLocked && selectionMode}
            panOnDrag={readOnly || !selectionMode}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.5}
              color="#cbd2dc"
            />
          </ReactFlow>

          {/* ── bottom-left: control pill ── */}
          <div className="absolute bottom-6 left-6 z-20 flex items-center gap-0.5 rounded-2xl border border-node-border bg-white px-1.5 py-1.5 shadow-lg">
            <ToolbarButton
              onClick={() => setToolbarCollapsed((c) => !c)}
              title={toolbarCollapsed ? "Expand" : "Collapse"}
            >
              {toolbarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </ToolbarButton>

            {!toolbarCollapsed && (
              <>
                <ToolbarButton onClick={undo} title="Undo (⌘Z)">
                  <Undo2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={redo} title="Redo (⌘⇧Z)">
                  <Redo2 className="h-4 w-4" />
                </ToolbarButton>

                <span className="mx-1 h-5 w-px bg-node-border" />

                <ToolbarButton
                  title="Keyboard shortcuts"
                  onClick={() => setShortcutsOpen(true)}
                >
                  <Command className="h-4 w-4" />
                </ToolbarButton>

                <span className="mx-1 h-5 w-px bg-node-border" />

                <ToolbarButton onClick={() => zoomOut()} title="Zoom out">
                  <Minus className="h-4 w-4" />
                </ToolbarButton>
                <span className="w-11 text-center text-[13px] font-medium tabular-nums text-slate-600">
                  {Math.round(zoom * 100)}%
                </span>
                <ToolbarButton onClick={() => zoomIn()} title="Zoom in">
                  <Plus className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => fitView({ padding: 0.3, duration: 300 })}
                  title="Fit view"
                >
                  <Maximize2 className="h-4 w-4" />
                </ToolbarButton>
                <button
                  onClick={() => setSelectionMode((m) => !m)}
                  title={selectionMode ? "Select mode (S)" : "Pan mode (S)"}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition",
                    selectionMode
                      ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  )}
                >
                  {selectionMode ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Move className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
          </div>

          {/* ── bottom-center: sticky note / add node pill ── */}
          {!readOnly && !canvasLocked && (
          <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
            {pickerOpen && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
                <NodePicker
                  onAdd={handleAdd}
                  onClose={() => setPickerOpen(false)}
                />
              </div>
            )}
            <div className="flex items-center gap-5 rounded-2xl border border-node-border bg-white px-4 py-2 shadow-lg">
              <button
                onClick={() => handleAdd("sticky-note")}
                title="Add Sticky Note"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <StickyNote className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                title="Add node"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
          )}

          {/* ── bottom-right: dark minimap ── */}
          {minimapOpen && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              nodeColor={(n) => MINIMAP_COLOR[n.type ?? ""] ?? "#52525b"}
              nodeStrokeWidth={0}
              maskColor="rgba(0,0,0,0.45)"
              className="!bottom-6 !right-6 !m-0 overflow-hidden !rounded-2xl !border-0 !shadow-xl"
              style={{ background: "#18181b", width: 230, height: 150 }}
            />
          )}
        </div>

        {historyOpen && (
          <HistoryPanel
            workflowId={workflow.id}
            refreshKey={refreshKey}
            isRunning={isRunning}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {shortcutsOpen && (
          <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />
        )}
      </div>
    </CanvasActionsProvider>
  );
}

export function WorkflowCanvas({
  workflow,
  readOnly = false,
}: {
  workflow: WorkflowDTO;
  readOnly?: boolean;
}) {
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadWorkflow(workflow.id, workflow.name, workflow.graph);
    setReady(true);
  }, [workflow, loadWorkflow]);

  if (!ready) return null;

  return (
    <ReactFlowProvider>
      <Flow workflow={workflow} readOnly={readOnly} />
    </ReactFlowProvider>
  );
}
