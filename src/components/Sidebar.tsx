"use client";
import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  PanelLeftClose,
  PanelLeft,
  Plus,
  Search,
  MessageSquare,
  Folder,
  Library,
  Workflow,
  Boxes,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
}

const NAV: NavItem[] = [
  { label: "New task", icon: <Plus className="h-[18px] w-[18px]" /> },
  { label: "Search Task", icon: <Search className="h-[18px] w-[18px]" /> },
  { label: "Task", icon: <MessageSquare className="h-[18px] w-[18px]" /> },
  { label: "Projects", icon: <Folder className="h-[18px] w-[18px]" /> },
  { label: "Library", icon: <Library className="h-[18px] w-[18px]" /> },
  {
    label: "Flow",
    icon: <Workflow className="h-[18px] w-[18px]" />,
    href: "/dashboard",
    active: true,
  },
  { label: "Tools", icon: <Boxes className="h-[18px] w-[18px]" /> },
  { label: "API / MCP", icon: <BookOpen className="h-[18px] w-[18px]" /> },
];

function publishCollapsedState(collapsed: boolean) {
  window.dispatchEvent(
    new CustomEvent("nf-sidebar-collapsed-change", {
      detail: { collapsed },
    })
  );
}

function persistCollapsedState(collapsed: boolean) {
  const value = collapsed ? "1" : "0";
  localStorage.setItem("nf-sidebar-collapsed", value);
  document.cookie = `nf-sidebar-collapsed=${value}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.style.setProperty(
    "--nf-sidebar-width",
    collapsed ? "60px" : "16rem"
  );
  publishCollapsedState(collapsed);
}

export function Sidebar({
  initialCollapsed = false,
}: {
  initialCollapsed?: boolean;
}) {
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const stored = localStorage.getItem("nf-sidebar-collapsed");
    const next = stored == null ? initialCollapsed : stored === "1";
    setCollapsed(next);
    persistCollapsedState(next);
    setReady(true);
  }, [initialCollapsed]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      persistCollapsedState(next);
      return next;
    });
  };

  const accountName = user?.fullName ?? user?.username ?? "Personal account";

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-node-border bg-white",
        ready && "transition-[width] duration-150"
      )}
      style={{ width: "var(--nf-sidebar-width, 16rem)" }}
    >
      {/* brand / toggle — fixed height so nav starts at the same y in both states */}
      <div className="flex h-[60px] items-center justify-between px-2.5">
        {!collapsed && (
          <Link
            href="/dashboard"
            className="pl-1 text-xl font-bold tracking-tight text-slate-900"
          >
            NextFlow
          </Link>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100",
            collapsed && "mx-auto"
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* nav — icon size + left padding identical in both states */}
      <nav className="space-y-0.5 px-2.5">
        {NAV.map((item) => {
          const inner = (
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium",
                item.active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span
                className={cn(
                  "grid h-[18px] w-[18px] shrink-0 place-items-center",
                  item.active ? "text-slate-900" : "text-slate-400"
                )}
              >
                {item.icon}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </span>
          );
          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className="block"
            >
              {inner}
            </Link>
          ) : (
            <button
              key={item.label}
              title={collapsed ? item.label : undefined}
              className="block w-full text-left"
            >
              {inner}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* footer: functional user button */}
      <div className="border-t border-node-border p-2.5">
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border border-node-border py-1.5",
            collapsed ? "justify-center px-1.5" : "px-2"
          )}
        >
          <UserButton afterSignOutUrl="/sign-in" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">
                {accountName}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
