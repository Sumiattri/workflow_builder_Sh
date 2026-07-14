"use client";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useWorkflowStore } from "@/lib/store";
import { getPort } from "@/lib/node-defs";
import { parseHandle, type PortType } from "@/lib/types";
import { portColor } from "../nodes/PortHandle";

export function AnimatedEdge({
  id,
  source,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const nodes = useWorkflowStore((s) => s.nodes);

  let type: PortType = "any";
  const srcNode = nodes.find((n) => n.id === source);
  const sh = parseHandle(sourceHandleId);
  if (srcNode && sh) {
    const port = getPort(srcNode, "out", sh.portId);
    if (port) type = port.type;
  }
  const color = portColor(type);

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 2,
        strokeDasharray: "6 4",
        animation: "dash 0.6s linear infinite",
        opacity: 0.85,
      }}
    />
  );
}
