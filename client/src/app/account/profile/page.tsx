import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiGetMe } from '@/lib/api';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const me = await apiGetMe(session.accessToken);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Profile
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Update your name. Email, role, and office are managed by an administrator.
        </p>
      </div>
      <ProfileForm key={`${me.firstName}|${me.lastName}`} profile={me} />
    </div>
  );
}
