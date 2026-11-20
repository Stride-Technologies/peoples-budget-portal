import { GitBranch } from 'lucide-react';

/**
 * Where this deployment's source code is published. The AGPL asks whoever runs a modified copy as
 * a site to offer its source to the site's users: a fork sets `NEXT_PUBLIC_SOURCE_URL` (read when
 * the client is built) to its own repository. Unset, it is the upstream project.
 */
export const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL?.trim() || 'https://github.com/Stride-Technologies/peoples-budget-portal';

export function SourceLink({ label }: { label: string }) {
  return (
    <a
      href={SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-lg border border-rule bg-paper-tint px-4 py-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
    >
      <GitBranch size={15} aria-hidden />
      {label}
    </a>
  );
}
