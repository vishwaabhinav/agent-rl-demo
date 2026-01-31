"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Phone, Radio, BarChart3 } from "lucide-react";

interface NavItem {
  href: string;
  shortLabel: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    shortLabel: "HARNESS",
    icon: <Phone className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
  {
    href: "/simulation",
    shortLabel: "SIMULATION",
    icon: <Radio className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
  {
    href: "/rl-dashboard",
    shortLabel: "DASHBOARD",
    icon: <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
  },
];

export function TopNav(): ReactNode {
  const pathname = usePathname();

  return (
    <nav className="relative bg-[#0a0e14] border-b border-[#1e3a4f]/60 sticky top-0 z-50">
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00d4ff]/30 to-transparent" />

      <div className="flex items-center h-10 px-4">
        {/* Brand / System ID */}
        <div className="flex items-center gap-2 pr-4 border-r border-[#1e3a4f]/40">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
          <span className="text-[10px] font-medium tracking-[0.2em] text-[#00d4ff]/80 uppercase">
            Recovery
          </span>
        </div>

        {/* Navigation Links */}
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
                    relative px-4 h-10 flex items-center gap-2 transition-all duration-200
                    ${isActive
                      ? "text-[#00d4ff]"
                      : "text-[#5a6a7a] hover:text-[#8a9aaa]"
                    }
                  `}
                >
                  <span className={isActive ? "opacity-100" : "opacity-60 group-hover:opacity-80"}>
                    {item.icon}
                  </span>
                  <span className="text-[10px] font-medium tracking-[0.12em] uppercase">
                    {item.shortLabel}
                  </span>

                  {/* Active indicator */}
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
      </div>
    </nav>
  );
}
