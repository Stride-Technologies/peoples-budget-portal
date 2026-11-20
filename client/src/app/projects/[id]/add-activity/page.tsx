import { redirect } from 'next/navigation';
import { createUnderHref } from '@/app/aip-registry/_resolve';

/**
 * Retired full-page route (FR-012) — redirects into the registry's "New
 * Activity" drawer, scoped to this project.
 */
export default async function AddActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params;
  redirect(await createUnderHref('activity', resolved.id));
}
