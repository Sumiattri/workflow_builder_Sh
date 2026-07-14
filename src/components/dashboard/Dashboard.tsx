"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Upload,
  Workflow as WorkflowIcon,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Download,
  Copy,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { exportWorkflow, importWorkflowFile } from "@/lib/io";
import { SYSTEM_WORKFLOWS, type SystemWorkflow } from "@/lib/system-workflows";
import type { WorkflowDTO, WorkflowListItem } from "@/lib/types";

interface DashboardProps {
  workflows: WorkflowListItem[];
  loadError?: string;
}

interface RenameTarget {
  id: string;
  name: string;
}

interface DeleteTarget {
  id: string;
  name: string;
}

function duplicateName(name: string, existingNames: string[]): string {
  const base = name.replace(/\s+Copy(?:\s+\d+)?$/i, "").trim() || name;
  const names = new Set(existingNames);
  const first = `${base} Copy`;
  if (!names.has(first)) return first;

  let index = 2;
  while (names.has(`${first} ${index}`)) index += 1;
  return `${first} ${index}`;
}

export default function Dashboard({ workflows, loadError }: DashboardProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [query, setQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const importRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((w) => w.name.toLowerCase().includes(q));
  }, [workflows, query]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = (await res.json()) as { id: string };
      router.push(`/workflow/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setCreating(false);
    }
  }

  function handleOpenSystem(t: SystemWorkflow) {
    // open the read-only template preview (with example outputs + Clone button)
    router.push(`/workflow/system/${t.id}`);
  }

  async function handleImport(file: File) {
    setError(null);
    setCreating(true);
    try {
      const { name, graph } = await importWorkflowFile(file);
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, graph }),
      });
      if (!res.ok) throw new Error("Failed to import workflow");
      const data = (await res.json()) as { id: string };
      router.push(`/workflow/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid workflow file");
      setCreating(false);
    }
  }

  function openRenameModal(id: string, currentName: string) {
    setError(null);
    setRenameTarget({ id, name: currentName });
    setRenameValue(currentName);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setError(null);
    setRenaming(true);
    try {
      const res = await fetch(`/api/workflows/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to rename workflow");
      setRenameTarget(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRenaming(false);
    }
  }

  function openDeleteModal(id: string, name: string) {
    setError(null);
    setDeleteTarget({ id, name });
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete workflow");
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  async function fetchWorkflow(id: string): Promise<WorkflowDTO> {
    const res = await fetch(`/api/workflows/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load workflow");
    return (await res.json()) as WorkflowDTO;
  }

  async function handleExport(id: string) {
    setError(null);
    try {
      const workflow = await fetchWorkflow(id);
      exportWorkflow(workflow.name, workflow.graph);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export workflow");
    }
  }

  async function handleDuplicate(id: string) {
    setError(null);
    setDuplicatingId(id);
    try {
      const workflow = await fetchWorkflow(id);
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: duplicateName(
            workflow.name,
            workflows.map((w) => w.name)
          ),
          graph: workflow.graph,
        }),
      });
      if (!res.ok) throw new Error("Failed to duplicate workflow");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate workflow");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="min-h-full bg-canvas text-slate-800">
      <input
        ref={importRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImport(f);
          e.target.value = "";
        }}
      />

      <div className="mx-auto max-w-7xl px-10 py-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              Flow
            </h1>
            <p className="mt-1 text-base text-slate-500">
              Build workflows or run models directly
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl border border-node-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              aria-label="Create new workflow"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* System Workflows */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            System Workflows
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Prebuilt workflow templates — click to open and start using.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SYSTEM_WORKFLOWS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleOpenSystem(t)}
                disabled={creating}
                className="group block overflow-hidden rounded-2xl border border-node-border bg-white text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
              >
                <div
                  className={cn(
                    "flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br",
                    t.gradient
                  )}
                >
                  <WorkflowIcon
                    className="h-10 w-10 text-white/80"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="px-4 py-3 text-[15px] font-semibold text-slate-800">
                  {t.name}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Your Workflows */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Your Workflows
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Open one to edit, run, and review history.
              </p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workflows..."
                className="w-full rounded-xl border border-node-border bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </div>
          </div>

          <div className="mt-6">
            {workflows.length === 0 ? (
              <EmptyState onCreate={handleCreate} creating={creating} />
            ) : filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">
                No workflows match “{query}”.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    duplicating={duplicatingId === wf.id}
                    onOpen={() => router.push(`/workflow/${wf.id}`)}
                    onRename={() => openRenameModal(wf.id, wf.name)}
                    onExport={() => handleExport(wf.id)}
                    onDuplicate={() => handleDuplicate(wf.id)}
                    onDelete={() => openDeleteModal(wf.id, wf.name)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <RenameWorkflowDialog
        open={!!renameTarget}
        value={renameValue}
        saving={renaming}
        onChange={setRenameValue}
        onCancel={() => {
          if (!renaming) setRenameTarget(null);
        }}
        onSubmit={submitRename}
      />
      <DeleteWorkflowDialog
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ""}
        deleting={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={submitDelete}
      />
    </div>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-node-border bg-white py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <WorkflowIcon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900">No workflows yet</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Create your first workflow to start wiring up inputs, models, and
        responses.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
      >
        {creating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Create New Workflow
      </button>
    </div>
  );
}

function WorkflowCard({
  workflow,
  duplicating,
  onOpen,
  onRename,
  onExport,
  onDuplicate,
  onDelete,
}: {
  workflow: WorkflowListItem;
  duplicating: boolean;
  onOpen: () => void;
  onRename: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          disabled={duplicating}
          className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl border border-node-border bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md disabled:cursor-wait"
        >
          {duplicating ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          ) : (
            <WorkflowIcon
              className="h-10 w-10 text-slate-200"
              strokeWidth={1.5}
            />
          )}
        </button>

        <button
          type="button"
          aria-label="Workflow actions"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-node-border bg-white/95 text-slate-500 opacity-0 shadow-sm transition hover:bg-white hover:text-slate-700 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-3 top-12 z-30 w-44 animate-fade-in overflow-hidden rounded-lg border border-node-border bg-white py-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRename();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                type="button"
                disabled={duplicating}
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                {duplicating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {duplicating ? "Duplicating..." : "Duplicate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onExport();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-slate-900">
            {workflow.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Edited {formatRelativeTime(workflow.updatedAt)}
          </p>
        </button>
      </div>
    </div>
  );
}

function RenameWorkflowDialog({
  open,
  value,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-[min(420px,calc(100vw-32px))] animate-fade-in rounded-xl border border-node-border bg-white p-6 shadow-2xl"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Rename workflow
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Update the workflow name shown on your dashboard.
          </p>
        </div>

        <div className="mt-5">
          <label
            htmlFor="workflow-name"
            className="text-sm font-medium text-slate-700"
          >
            Name
          </label>
          <input
            id="workflow-name"
            autoFocus
            value={value}
            disabled={saving}
            onChange={(event) => onChange(event.target.value)}
            className="mt-2 w-full rounded-lg border border-node-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </div>

        <div className="mt-6 flex w-full items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-lg border border-node-border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteWorkflowDialog({
  open,
  name,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className="w-[min(420px,calc(100vw-32px))] animate-fade-in rounded-xl border border-node-border bg-white p-6 shadow-2xl"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Delete workflow
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Delete <span className="font-medium text-slate-700">"{name}"</span>?
            This action cannot be undone.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-lg border border-node-border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="inline-flex min-w-[92px] items-center justify-center gap-2 rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
