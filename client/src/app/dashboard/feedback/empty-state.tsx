import { Lock } from 'lucide-react';

/**
 * "Nothing here" and "you may not look here" are different answers, and the
 * feedback tables used to give the same one for both — a 403 was swallowed into
 * an empty list, so a user without permission was told there was no feedback.
 */
export default function FeedbackEmptyState({
  accessDenied,
  message,
}: {
  accessDenied?: boolean;
  /** Shown when the list is genuinely empty. */
  message: string;
}) {
  if (accessDenied) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Lock className="h-5 w-5 text-neutral-400" aria-hidden />
        <p className="text-sm font-medium text-neutral-700">
          You don’t have access to this feedback
        </p>
        <p className="max-w-sm text-xs text-neutral-500">
          Your account isn’t scoped to the offices this covers. Ask an
          administrator to grant access if you need it.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-10 text-sm text-neutral-400">{message}</div>
  );
}
