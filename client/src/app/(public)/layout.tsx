import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { PublicNav } from "@/components/public/public-nav";
import { CookieSettingsLink } from "@/components/analytics/cookie-consent-banner";
import { VISIONS } from "@/lib/finish-lines";
import { OG_IMAGES, SITE_URL } from "@/lib/seo";
import { Seal } from "@/components/brand/seal";
import { getBrand } from "@/lib/brand-server";
import { LocaleLink } from "@/components/i18n/locale-link";
import { SuggestTranslation } from "@/components/i18n/suggest-translation";
import { getT } from "@/i18n/server";
import { rich } from "@/i18n/rich";
import type { MessageKey } from "@/i18n/t";
import { EXPLORER_ENABLED } from "@/lib/explore/view-url";
import { HEARINGS_ENABLED } from "@/lib/hearings/config";

const SITE_NAME = "People's Budget Portal";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const title = `${SITE_NAME} | ${brand.government}`;
  const description = `Browse ${brand.placeName}'s Annual Investment Program. View programs, project activities, version history, and leave public feedback.`;
  return {
    title,
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url: SITE_URL, images: OG_IMAGES },
    twitter: { card: "summary_large_image", title, description, images: ["/api/og"] },
  };
}

const FOOTER_LINKS: { label: MessageKey; href: string }[] = [
  { label: "footer.aip", href: "/aip" },
  { label: "footer.annual", href: "/annual" },
  ...(EXPLORER_ENABLED ? [{ label: "footer.explore" as MessageKey, href: "/explore" }] : []),
  ...(HEARINGS_ENABLED ? [{ label: "footer.hearings" as MessageKey, href: "/hearings" }] : []),
  { label: "footer.learn", href: "/learn" },
  { label: "footer.ppmp", href: "/ppmp" },
  { label: "footer.developers", href: "/developers" },
  { label: "footer.license", href: "/license" },
];

const BUDGET_101_LINKS = [
  {
    label: "DBM Budget Operations Manual",
    href: "https://www.dbm.gov.ph/index.php/budget-operations-manual-for-lgus",
  },
  {
    label: "Budget Natin Guidebook",
    href: "https://www.wesolve.ph/budget-natin-guidebook",
  },
];

function FooterColumn({
  heading,
  links,
  external = false,
}: {
  heading: string;
  links: readonly { label: string; href: string }[];
  external?: boolean;
}) {
  return (
    <div>
      <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-paper/50">
        {heading}
      </h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <LocaleLink
              href={link.href}
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="text-sm text-paper/70 transition-colors hover:text-paper"
            >
              {link.label}
            </LocaleLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  const brand = await getBrand();
  // The footer follows the page language.
  const t = await getT();

  // Logged-in users already have the authenticated app nav from the root
  // layout, so render the public page content bare to avoid a second nav.
  // Logged-out visitors get the full public chrome (nav + footer).
  if (session) {
    return <div className="flex-1 bg-paper">{children}</div>;
  }

  return (
    <div className="flex min-h-full flex-col bg-paper">
      {/* Keyboard users would otherwise tab the whole nav on every page before
          reaching the content. Visible only while focused (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t("footer.skip")}
      </a>

      <PublicNav />

      <main id="main-content" className="flex-1 bg-paper">
        {children}
      </main>

      <footer className="mt-20 bg-ink text-paper">
        {/* Same eight finish-line colours as the top rule, closing the page the
            way it opened. */}
        <div aria-hidden="true" className="flex h-1.5">
          {VISIONS.map((v) => (
            <span key={v.id} className="flex-1" style={{ backgroundColor: v.color }} />
          ))}
        </div>

        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <div className="flex items-center gap-3">
                <Seal className="h-10 w-10" />
                <p className="font-display text-xl font-medium leading-tight tracking-[-0.02em] text-paper">
                  People&rsquo;s Budget Portal
                </p>
              </div>
              <p className="mt-6 max-w-md text-sm leading-7 text-paper/70">
                {rich(t("footer.credits"), {
                  wesolve: (
                    <Link
                    href="https://www.wesolve.ph/"
                    className="text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                  >
                    WeSolve Foundation
                  </Link>
                  ),
                  stride: (
                    <Link
                    href="https://www.stridetech.ph/"
                    className="text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                  >
                    Stride Technologies
                  </Link>
                  ),
                  bettergov: (
                    <Link
                    href="https://bettergov.ph/"
                    className="text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                  >
                    BetterGov.PH
                  </Link>
                  ),
                })}
              </p>
              <p className="mt-4 max-w-md text-sm leading-7 text-paper/70">
                {t("footer.partnership")}
              </p>
            </div>

            <FooterColumn
              heading={t("footer.thePortal")}
              links={FOOTER_LINKS.map((l) => ({ ...l, label: t(l.label) }))}
            />
            {/* Document titles: kept as the publishers name them. */}
            <FooterColumn heading={t("footer.budget101")} links={BUDGET_101_LINKS} external />

            <div>
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-paper/50">
                {t("footer.contact")}
              </h3>
              <address className="mt-5 space-y-2 text-sm not-italic leading-7 text-paper/70">
                {brand.address.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {brand.website && (
                  <p>
                    <Link
                      href={brand.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-paper underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
                    >
                      {brand.website.replace(/^https?:\/\/(www\d?\.)?/, "").replace(/\/$/, "")}
                    </Link>
                  </p>
                )}
              </address>
            </div>
          </div>

          <div className="mt-16 flex flex-col gap-3 border-t border-paper/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-paper/50">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <div className="flex flex-wrap gap-5 text-xs text-paper/50">
              {[
                { label: t('footer.privacy'), href: '/privacy-policy' },
                { label: t('footer.terms'), href: '/terms' },
                { label: t('footer.license'), href: '/license' },
              ].map(({ label, href }) => (
                <LocaleLink
                  key={href}
                  href={href}
                  className="transition-colors hover:text-paper"
                >
                  {label}
                </LocaleLink>
              ))}
              <CookieSettingsLink />
              <SuggestTranslation className="transition-colors hover:text-paper" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
