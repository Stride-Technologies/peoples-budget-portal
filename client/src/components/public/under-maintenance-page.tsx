import Link from "next/link";
import {
  PolicyPage,
  PolicyFooter,
} from "@/components/public/editorial/policy-page";
import { VISIONS } from "@/lib/finish-lines";
import { BrandText } from '@/components/brand/brand-text';
import { LguWord } from '@/components/brand/brand-text';

interface UnderMaintenancePageProps {
  title: string;
  description: string;
}

/**
 * A page that exists but has no content yet.
 *
 * Uses the same shell as the real policy documents rather than its own layout:
 * a placeholder that looks like a different site reads as a broken link, and this
 * way it inherits every future change to the shell for free.
 */
export function UnderMaintenancePage({
  title,
  description,
}: UnderMaintenancePageProps) {
  return (
    <PolicyPage
      eyebrow={<BrandText field="government" />}
      title={title}
      accent={VISIONS[2].color}
      meta={<>Not yet published</>}
    >
      <p className="text-[0.9375rem] leading-7 text-ink-muted">{description}</p>

      <PolicyFooter>
        <p>
          In the meantime, read{" "}
          <Link
            href="/learn"
            className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            how the budget works
          </Link>
          , or browse{" "}
          <Link
            href="/aip"
            className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            what the <LguWord k="lgu" /> has proposed
          </Link>
          .
        </p>
      </PolicyFooter>
    </PolicyPage>
  );
}
