import { apiPreviewInvite } from "@/lib/api";
import { visitorIp } from "@/lib/visitor-ip";
import SetPasswordForm from "./set-password-form";
import { Seal } from '@/components/brand/seal';

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm text-center">
        <Seal size={48} className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-xl font-semibold text-neutral-900 mb-2">
          Invalid link
        </h1>
        <p className="text-sm text-neutral-500">
          This invite link is missing, expired, or already used. Please use the
          link sent to your email or ask for a new invitation.
        </p>
      </div>
    </div>
  );
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) return <InvalidLink />;

  let invite;
  try {
    invite = await apiPreviewInvite(token, await visitorIp());
  } catch {
    return <InvalidLink />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <SetPasswordForm token={token} invite={invite} />
    </div>
  );
}
