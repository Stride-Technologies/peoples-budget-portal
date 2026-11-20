import type { Metadata } from "next";
import { Geist, Geist_Mono, Mona_Sans, Figtree } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import Navbar from "@/components/layout/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { resolveProponentContext } from "@/lib/proponent";
import { apiGetAipCycles, type AipCycleRecord } from "@/lib/api";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";
import { isProd } from "@/lib/site-env";
import { OG_IMAGES, SITE_URL } from "@/lib/seo";
import { BrandProvider } from "@/components/brand/brand-provider";
import { getBrand } from "@/lib/brand-server";
import { paletteStyle } from "@/lib/palettes";
import { getLocale } from "@/i18n/server";
import { LOCALE_TAG } from "@/i18n/locales";
import { LocaleProvider } from "@/i18n/locale-provider";

const figtreeHeading = Figtree({subsets:['latin'],variable:'--font-heading', weight:['700']});

/**
 * Editorial display face for the public pages — currently Figtree, mapped in
 * `globals.css` where `--font-display` resolves to `--font-heading`.
 *
 * Newsreader is kept below, commented out, because it is the only thing that
 * has to come back to restore the serif: uncomment it, add `Newsreader` to the
 * next/font import and `newsreaderDisplay.variable` to <html>, and point
 * `--font-display` back at itself in globals.css. The 47 `font-display` classes
 * on the public pages need no edit either way.
 *
 * const newsreaderDisplay = Newsreader({
 *   subsets: ['latin'],
 *   weight: ['200', '300', '400'],
 *   style: ['normal', 'italic'],
 *   variable: '--font-display',
 * });
 */

const monaSans = Mona_Sans({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const where = [brand.government, brand.province].filter(Boolean).join(", ");
  const description = `Official Annual Investment Program (AIP) portal of the ${where}. Browse public spending, programs, project activities, and budget allocations across all offices.`;
  // favicon.ico lives in public/, not app/. The seal, when the LGU set one, is the larger icon.
  const seal = brand.sealSrc ? [{ url: brand.sealSrc, type: "image/png" }] : [];
  return {
    metadataBase: new URL(SITE_URL),
    title: brand.siteName,
    description,
    keywords: [
      `${brand.placeName} budget`,
      `${brand.shortName} AIP`,
      `Annual Investment Program ${brand.shortName}`,
      `${brand.shortName} government spending`,
      `${brand.shortName} public funds`,
    ],
    icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, ...seal], shortcut: seal.map((s) => s.url), apple: seal },
    openGraph: { type: "website", siteName: brand.siteName, title: brand.siteName, description, url: SITE_URL, images: OG_IMAGES },
    twitter: { card: "summary_large_image", title: brand.siteName, description, images: ["/api/og"] },
    // Non-prod deployments are de-indexed via meta tag + X-Robots-Tag header (D4).
    robots: isProd ? undefined : { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const brand = await getBrand();
  // The page's language from its /fil or /bcl prefix (specs/014).
  const locale = await getLocale();
  const proponentContext = session
    ? await resolveProponentContext(session.user, session.accessToken)
    : null;

  // Active-cycle fiscal year for the nav label (same precedence as the dashboard:
  // the open cycle, else a planning cycle, else the most recent).
  let activeFiscalYear: number | null = null;
  if (session) {
    const cycles = await apiGetAipCycles(session.accessToken).catch(
      () => [] as AipCycleRecord[],
    );
    const activeCycle =
      cycles.find((c) => c.status === 'OPEN') ??
      cycles.find((c) => c.status === 'PLANNING') ??
      cycles[0] ??
      null;
    activeFiscalYear = activeCycle?.fiscalYear ?? null;
  }

  return (
    <html
      lang={LOCALE_TAG[locale]}
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", monaSans.variable, figtreeHeading.variable)}
      style={brand.palette ? paletteStyle(brand.palette) : undefined}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "GovernmentOrganization",
              "@id": `${SITE_URL}/#organization`,
              name: brand.government,
              url: SITE_URL,
              areaServed: {
                "@type": "AdministrativeArea",
                name: brand.placeName,
                ...(brand.province ? { containedInPlace: { "@type": "AdministrativeArea", name: `${brand.province}, Philippines` } } : {}),
              },
            }),
          }}
        />
        <BrandProvider brand={brand}>
        <LocaleProvider locale={locale}>
        <TooltipProvider>
          {session && (
            <Navbar
              user={session.user}
              proponentContext={proponentContext}
              fiscalYear={activeFiscalYear}
            />
          )}
          <main className="flex-1">{children}</main>
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
        <GoogleAnalytics />
        <CookieConsentBanner />
        </LocaleProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
