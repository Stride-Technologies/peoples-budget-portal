import Link from 'next/link';
import ResetPasswordForm from './reset-password-form';
import { Seal } from '@/components/brand/seal';

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm text-center">
        <Seal size={48} className="mx-auto mb-4 h-12 w-12" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Invalid link
        </h1>
        <p className="text-sm text-neutral-500">
          This reset link is missing or malformed. Request a new one from the{' '}
          <Link href="/forgot-password" className="font-medium text-blue-600">
            forgot password
          </Link>{' '}
          page.
        </p>
      </div>
    </div>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) return <InvalidLink />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <ResetPasswordForm token={token} />
    </div>
  );
}
