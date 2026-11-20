import { redirect } from 'next/navigation';
import { createUnderHref } from '@/app/aip-registry/_resolve';

/**
 * Retired full-page route (FR-012) — redirects into the registry's "New
 * Project" drawer, scoped to this program.
 */
export default async function AddProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params;
  redirect(await createUnderHref('project', resolved.id));
}

