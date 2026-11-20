import { ChangePasswordForm } from './change-password-form';

export default function SecurityPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Security
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Change your password. Changing it signs you out of every other device.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
