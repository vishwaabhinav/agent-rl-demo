"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Call Harness", icon: "📞" },
  { href: "/simulation", label: "Voice Simulation", icon: "🎭" },
  { href: "/rl-dashboard", label: "RL Dashboard", icon: "📊" },
];

interface TopNavProps {
  title?: string;
  description?: string;
  statusIndicator?: ReactNode;
  actions?: ReactNode;
}

export function TopNav({ title, description, statusIndicator, actions }: TopNavProps): ReactNode {
  const pathname = usePathname();

  return (
    <nav className="bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 px-4 py-3 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-zinc-400">Recovery Agent</span>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          {title && (
            <>
              <div className="w-px h-6 bg-zinc-700" />
              <div>
                <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
                {description && (
                  <p className="text-xs text-zinc-500">{description}</p>
                )}
              </div>
            </>
          )}
        </div>
        {(statusIndicator || actions) && (
          <div className="flex items-center gap-4">
            {statusIndicator}
            {actions}
          </div>
        )}
      </div>
    </nav>
  );
}
