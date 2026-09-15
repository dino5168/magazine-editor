import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SubNavItem {
  readonly label: string;
  readonly icon: LucideIcon;
}

interface LeafNavItem {
  readonly kind: "leaf";
  readonly label: string;
  readonly icon: LucideIcon;
}

interface ParentNavItem {
  readonly kind: "parent";
  readonly label: string;
  readonly icon: LucideIcon;
  readonly children: readonly SubNavItem[];
}

type NavItem = LeafNavItem | ParentNavItem;

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

const NAV_SECTIONS = [
  {
    title: "OVERVIEW",
    items: [
      { kind: "leaf", label: "首頁", icon: LayoutDashboard },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { kind: "leaf", label: "Settings", icon: Settings },
    ],
  },
] as const satisfies readonly NavSection[];

type _AllNavItems = typeof NAV_SECTIONS[number]["items"][number];
type _ParentItems = Extract<_AllNavItems, { readonly kind: "parent" }>;
export type NavItemLabel =
  | _AllNavItems["label"]
  | _ParentItems["children"][number]["label"];

function isParentNavItem(item: NavItem): item is ParentNavItem {
  return item.kind === "parent";
}

interface AppSidebarProps {
  readonly className?: string;
  readonly activeItem: NavItemLabel;
  readonly onActiveChange: (label: NavItemLabel) => void;
}

export function AppSidebar({ className, activeItem, onActiveChange }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<NavItemLabel>>(new Set());

  const toggleExpand = (label: NavItemLabel): void => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "flex flex-col bg-gray-100 text-gray-900 transition-all duration-300 overflow-hidden flex-shrink-0 border-r border-gray-200",
        collapsed ? "w-16" : "w-64",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-400 text-sm font-bold text-white">
          App
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{"雜誌編輯軟體"}</p>
            <p className="truncate text-xs text-gray-500">Dashboard</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.title} className={cn(si > 0 && "mt-1")}>
            {si > 0 && <div className="mx-1 my-3 border-t border-gray-200" />}

            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {section.title}
              </p>
            )}

            {section.items.map((item: NavItem) => {
              const isActive   = activeItem === item.label;
              const isExpanded = expandedItems.has(item.label as NavItemLabel);
              const isParent   = isParentNavItem(item);
              const Icon       = item.icon;

              return (
                <div key={item.label}>
                  <button
                    onClick={() => {
                      if (isParent && !collapsed) toggleExpand(item.label as NavItemLabel);
                      onActiveChange(item.label as NavItemLabel);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-gray-300 font-semibold text-gray-900"
                        : "text-gray-600 hover:bg-gray-200 hover:text-gray-900",
                    )}
                  >
                    <Icon
                      size={18}
                      className={cn(
                        "flex-shrink-0",
                        isActive ? "text-gray-900" : "text-gray-500",
                      )}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        {isParent && (
                          isExpanded
                            ? <ChevronDown  size={14} className="flex-shrink-0 text-gray-400" />
                            : <ChevronRight size={14} className="flex-shrink-0 text-gray-400" />
                        )}
                      </>
                    )}
                  </button>

                  {isParent && !collapsed && isExpanded && (
                    <div className="ml-4 mt-0.5 border-l border-gray-300 pl-3">
                      {item.children.map((child) => {
                        const ChildIcon     = child.icon;
                        const isChildActive = activeItem === child.label;
                        return (
                          <button
                            key={child.label}
                            onClick={() => onActiveChange(child.label as NavItemLabel)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                              isChildActive
                                ? "bg-gray-300 font-semibold text-gray-900"
                                : "text-gray-500 hover:bg-gray-200 hover:text-gray-900",
                            )}
                          >
                            <ChildIcon size={15} className="flex-shrink-0" />
                            <span className="truncate text-left">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-lg bg-gray-200 py-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-300 hover:text-gray-900"
      >
        {collapsed ? (
          <ChevronRight size={14} />
        ) : (
          <>
            <ChevronLeft size={14} />
            Collapse sidebar
          </>
        )}
      </button>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-400 text-xs font-bold text-white">
          US
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">User</p>
              <p className="truncate text-xs text-gray-500">Admin</p>
            </div>
            <button className="flex-shrink-0 rounded border border-gray-300 p-1 text-gray-400 hover:text-gray-900">
              <LayoutGrid size={14} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}