import { useState, useCallback } from "react"

/**
 * Expand/collapse state for the AIP registry's rows.
 *
 * One flat Set holds both program ids and office-group keys — they cannot
 * collide, so the office headers in the grouped view need no separate state.
 *
 * Deliberately not persisted. 53 office keys would add ~2 KB to every request,
 * and restoring an expansion whose contents have since changed is the same
 * disorientation `filter-cookie.ts` cites for not remembering the page number.
 */
export function useAIPExpand() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const isExpanded = useCallback(
    (id: string) => expandedIds.has(id),
    [expandedIds]
  )

  const expandId = useCallback((id: string) => {
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  /**
   * Expand or collapse a whole set of ids at once.
   *
   * Opening an office is one gesture, so it has to be one state update —
   * expanding its programs and their projects one `expandId` at a time would
   * queue dozens of separate updates for a single click.
   */
  const setManyExpanded = useCallback((ids: string[], expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (expanded) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  // `expandAll` / `collapseAll` used to live here. Nothing called either, and
  // `expandAll` was a no-op anyway — `new Set(prev)` copies the same members.
  return {
    expandedIds,
    toggleExpand,
    isExpanded,
    expandId,
    setManyExpanded,
  }
}
