"use client";
import { createContext, useContext } from "react";
import { type RunScope } from "@/lib/types";

export interface CanvasActions {
  runNodes: (nodeIds: string[], scope: RunScope) => void;
  cancel: (nodeId?: string) => void;
  isRunning: boolean;
  activeRunId: string | null;
  activeScope: RunScope | null;
  readOnly: boolean;
}

const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions(): CanvasActions {
  const ctx = useContext(CanvasActionsContext);
  if (!ctx) {
    return {
      runNodes: () => {},
      cancel: () => {},
      isRunning: false,
      activeRunId: null,
      activeScope: null,
      readOnly: false,
    };
  }
  return ctx;
}
