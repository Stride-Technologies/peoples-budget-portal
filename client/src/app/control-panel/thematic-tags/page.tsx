import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiListThematicTagsAll } from '@/lib/api';
import ThematicTagList from './thematic-tag-list';

export default async function ThematicTagsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const tags = await apiListThematicTagsAll(session.accessToken).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Thematic Tags</h1>
        <p className="text-sm text-neutral-500 mt-1">
          The catalog behind the AIP registry&apos;s Thematic Tags filter and the
          tag picker on a program or PA. Deactivating a tag drops it from the
          picker and every filter — rows that already carry it keep it.
        </p>
      </div>
      <ThematicTagList tags={tags} />
    </div>
  );
}
