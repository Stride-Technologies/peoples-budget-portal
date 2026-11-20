import { redirect } from 'next/navigation';
import { ppaEditHref } from '@/app/aip-registry/_resolve';

/**
 * Retired full-page route (FR-012) — redirects into the registry's PA
 * overview drawer, opened straight into its in-place edit mode.
 */
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params;
  redirect(await ppaEditHref('project', resolved.id));
}
