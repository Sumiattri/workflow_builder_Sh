"use client";
import { Handle, Position } from "@xyflow/react";
import { type Port, type PortType, inHandle, outHandle } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PORT_COLORS: Record<PortType, string> = {
  text: "#f59e0b",
  image: "#4f7cf6",
  video: "#a855f7",
  audio: "#14b8a6",
  file: "#6b7280",
  number: "#ec4899",
  any: "#6366f1",
};

export function portColor(type: PortType): string {
  return PORT_COLORS[type];
}

export function PortHandle({
  port,
  dir,
}: {
  port: Port;
  dir: "in" | "out";
}) {
  const isInput = dir === "in";
  const color = portColor(port.type);
  return (
    <Handle
      type={isInput ? "target" : "source"}
      position={isInput ? Position.Left : Position.Right}
      id={isInput ? inHandle(port.id) : outHandle(port.id)}
      className={cn("!h-3 !w-3 !border-2 !border-white !shadow-sm")}
      style={{
        background: color,
        // straddle the card border: body padding is px-3.5 (14px), handle is 12px
        left: isInput ? -20 : "auto",
        right: isInput ? "auto" : -20,
        top: "50%",
        transform: "translateY(-50%)",
      }}
    />
  );
}

export function PortDot({ type }: { type: PortType }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: portColor(type) }}
    />
  );
}
