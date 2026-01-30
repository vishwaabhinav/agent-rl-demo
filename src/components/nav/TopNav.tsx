"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Phone, Radio, BarChart3 } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Call Harness",
    shortLabel: "HARNESS",
    icon: <Phone className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
  {
    href: "/simulation",
    label: "Voice Simulation",
    shortLabel: "SIMULATION",
    icon: <Radio className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
  {
    href: "/rl-dashboard",
    label: "RL Dashboard",
    shortLabel: "DASHBOARD",
    icon: <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
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
    <nav className="relative bg-[#0a0e14] border-b border-[#1e3a4f]/60 sticky top-0 z-50">
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00d4ff]/30 to-transparent" />

      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center h-11 px-4">
          {/* Brand / System ID */}
          <div className="flex items-center gap-3 pr-5 border-r border-[#1e3a4f]/40">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
              <span className="text-[10px] font-medium tracking-[0.2em] text-[#00d4ff]/80 uppercase">
                Recovery
              </span>
            </div>
          </div>

          {/* Navigation Modules */}
          <div className="flex items-center">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative"
                >
                  <div
                    className={`
                      relative px-4 h-11 flex items-center gap-2 transition-all duration-200
                      ${isActive
                        ? "text-[#00d4ff]"
                        : "text-[#5a6a7a] hover:text-[#8a9aaa]"
                      }
                    `}
                  >
                    {/* Icon */}
                    <span className={isActive ? "opacity-100" : "opacity-60 group-hover:opacity-80"}>
                      {item.icon}
                    </span>

                    {/* Label */}
                    <span className="text-[10px] font-medium tracking-[0.12em] uppercase">
                      {item.shortLabel}
                    </span>

                    {/* Active indicator - bottom glow line */}
                    {isActive && (
                      <div className="absolute bottom-0 left-3 right-3 h-px">
                        <div className="absolute inset-0 bg-[#00d4ff]" />
                        <div className="absolute inset-0 bg-[#00d4ff] blur-[2px]" />
                      </div>
                    )}

                    {/* Hover indicator */}
                    {!isActive && (
                      <div className="absolute bottom-0 left-3 right-3 h-px bg-[#5a6a7a]/0 group-hover:bg-[#5a6a7a]/30 transition-colors duration-200" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          {title && (
            <div className="mx-4 h-4 w-px bg-[#1e3a4f]/50" />
          )}

          {/* Page Context */}
          {title && (
            <div className="flex items-center">
              <div className="flex flex-col justify-center">
                <h1 className="text-[12px] font-medium text-[#c0cad8] leading-tight tracking-wide">
                  {title}
                </h1>
                {description && (
                  <p className="text-[9px] text-[#5a6a7a] leading-tight mt-0.5 tracking-wide">
                    {description}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Status & Actions */}
          {(statusIndicator || actions) && (
            <div className="flex items-center gap-3">
              {statusIndicator}
              {actions && (
                <>
                  <div className="h-4 w-px bg-[#1e3a4f]/50" />
                  {actions}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * Status pill component for consistent status indicators in nav
 */
export function NavStatusPill({
  status,
  label
}: {
  status: "online" | "offline" | "active" | "idle" | "loading" | "error";
  label?: string;
}): ReactNode {
  const config = {
    online: { color: "#00ff88", pulse: false },
    offline: { color: "#ff4757", pulse: false },
    active: { color: "#00d4ff", pulse: true },
    idle: { color: "#5a6a7a", pulse: false },
    loading: { color: "#ffaa00", pulse: true },
    error: { color: "#ff4757", pulse: true },
  }[status];

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex items-center justify-center">
        <div
          className={`w-1.5 h-1.5 rounded-full ${config.pulse ? "animate-pulse" : ""}`}
          style={{ backgroundColor: config.color, boxShadow: `0 0 6px ${config.color}50` }}
        />
      </div>
      {label && (
        <span className="text-[9px] font-medium tracking-wider uppercase text-[#5a6a7a]">
          {label}
        </span>
      )}
    </div>
  );
}
