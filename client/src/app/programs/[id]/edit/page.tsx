import { redirect } from "next/navigation"
import { ppaEditHref } from "@/app/aip-registry/_resolve"

/**
 * Retired full-page route (FR-012) — redirects into the registry's program
 * overview drawer, opened straight into its in-place edit mode.
 */
export default async function ProgramEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(await ppaEditHref('program', id))
}
