import { resolveCopy, type Copy, type CopyPart } from '@/lib/budget-cycle';
import { isProd } from '@/lib/site-env';

/**
 * Renders copy that may hold statements the city has not confirmed yet
 * (`{ unconfirmed, fallback }`, `lib/budget-cycle.ts`). Dev and staging show
 * them highlighted with "to confirm"; production renders the fallback, or
 * nothing when it is empty. Used by `/learn`.
 */
export function CopyParts({ parts }: { parts: CopyPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.unconfirmed ? (
          <mark key={i} className="rounded-sm bg-[#FFF1B8] text-inherit">
            {p.text}
            <span className="ml-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-[#7A5B00]">
              to confirm
            </span>
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function UnconfirmedCopy({ copy }: { copy: Copy }) {
  return <CopyParts parts={resolveCopy(copy, isProd)} />;
}
