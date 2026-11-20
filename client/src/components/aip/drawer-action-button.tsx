"use client";

import type { ComponentProps, ElementType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Footer action for the overview drawers.
 *
 * Edit and Delete used to live behind a `…` overflow menu, which hid the two
 * most-used actions behind an extra click and gave no hint of what was inside.
 * They are real buttons now; when the drawer is dragged narrow the label drops
 * and the icon carries it, so the row degrades instead of wrapping.
 *
 * The label always survives as `title` + `aria-label`, so collapsing is purely
 * visual — screen readers and hover tooltips read the same either way.
 */
export function DrawerActionButton({
  icon: Icon,
  label,
  compact = false,
  className,
  ...props
}: {
  icon: ElementType;
  label: string;
  /** Drop the text and render icon-only. */
  compact?: boolean;
} & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Button
      size="sm"
      variant="outline"
      title={label}
      aria-label={label}
      className={cn(
        "h-9 text-sm",
        compact ? "w-9 px-0" : "gap-1.5 px-3",
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact && label}
    </Button>
  );
}
