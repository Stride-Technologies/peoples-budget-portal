"use client";

import { cn } from "@/lib/utils";

/**
 * Tab strip for the overview drawers.
 *
 * Hand-rolled rather than a shadcn primitive: `components/ui/tabs.tsx` does not
 * exist in this project and the UI layer is `@base-ui/react`, not Radix — so
 * `shadcn add tabs` would pull in the wrong variant. This mirrors the markup and
 * ARIA wiring already used by `aip-registry-tabs.tsx`.
 */
export interface DrawerTab<T extends string> {
  value: T;
  label: string;
  /** Rendered as a pill beside the label. Omit (or pass null) for no count. */
  count?: number | null;
}

export function DrawerTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  className,
}: {
  tabs: DrawerTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Namespaces the ids so two drawers can be mounted at once. */
  idPrefix: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Drawer sections"
      className={cn(
        "flex flex-wrap gap-1 border-b border-slate-200 bg-white px-4 sm:px-6 py-2",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${idPrefix}-tab-${tab.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-blue-50 text-blue-800"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  active
                    ? "bg-blue-100 text-blue-800"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Panel wrapper that pairs with the ids `DrawerTabs` generates. */
export function DrawerTabPanel({
  idPrefix,
  value,
  active,
  children,
}: {
  idPrefix: string;
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      id={`${idPrefix}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${value}`}
    >
      {children}
    </div>
  );
}
