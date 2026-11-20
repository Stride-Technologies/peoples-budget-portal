import type { NextConfig } from "next";
import path from "node:path";

// CI already runs `tsc --noEmit` before deployment, so there is no value in
// repeating the TypeScript check inside `docker build`. Setting SKIP_TS_CHECK=1
// in the Dockerfile lets us skip it on the memory-constrained DO Droplet (2 GB)
// where the check otherwise OOMs and hangs. (Next 16 no longer runs ESLint during
// `next build`, so no eslint config is needed here.)
const skipChecks = process.env.SKIP_TS_CHECK === "1";

// A program id, for telling an old /aip/<programId> deep link apart from a page
// under /aip/<year>. Written out rather than loosely matched so a fiscal year can
// never satisfy it.
const UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

// The Content-Security-Policy every page is served with. The only third parties
// are GA4 (consent-gated, components/analytics/google-analytics.tsx) and
// reCAPTCHA v3 (lib/recaptcha.ts); hosts are from Google's own CSP guides for each.
//
// ponytail: script-src keeps 'unsafe-inline' because Next streams the RSC payload
// in inline <script> tags. Dropping it needs a per-request nonce from middleware,
// which makes every page dynamic and loses the 5-minute public cache. Revisit if
// that trade is ever worth it; the other directives still stop framing, plugin
// content, <base> hijacks and off-site form posts.
const isDev = process.env.NODE_ENV === "development";
// The hearings pages (docs/modules/hearings.md), only where a hearings API is configured: its
// origin for posters and its own copies of videos, and YouTube for the sessions streamed there.
// The player is the cookie-less one, and its script loads only when a visitor plays a video.
const hearingsOrigin = (() => {
  try {
    const url = new URL((process.env.NEXT_PUBLIC_HEARINGS_API_URL ?? "").trim());
    return /^https?:$/.test(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
})();
const hearings = hearingsOrigin
  ? {
      script: " https://www.youtube.com",
      img: ` https://i.ytimg.com ${hearingsOrigin}`,
      frame: " https://www.youtube-nocookie.com",
      media: `media-src 'self' ${hearingsOrigin}`,
    }
  : { script: "", img: "", frame: "", media: "" };
const csp = [
  "default-src 'self'",
  // 'unsafe-eval' only for `next dev` (React's dev-time stack reconstruction).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/${hearings.script}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com${hearings.img}`,
  "font-src 'self' data:",
  // GA4 also beacons to www.google.com/g/collect (seen in a browser, not in the guide).
  `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com https://*.g.doubleclick.net${isDev ? " ws:" : ""}`,
  // 'self': the staff source viewer frames /api/source-pdf.
  `frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/${hearings.frame}`,
  ...(hearings.media ? [hearings.media] : []),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Browsers ignore HSTS over plain http, so this is inert on localhost.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The source viewer frames city portal scans through this route; only our
      // own pages may frame it. A later match overrides the same keys above, and
      // the PDF gets no object-src/sandbox, which would stop the browser's viewer.
      // The explorer's "Speak" button (specs/018 P4) records on this page only;
      // every other page keeps the microphone off. Same override rule as below.
      ...["/explore", "/:locale(fil|bcl)/explore"].map((source) => ({
        source,
        headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" }],
      })),
      {
        source: "/api/source-pdf",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  // Emit a self-contained server bundle so the client ships as a slim
  // container image (see docs/deployment.md).
  output: "standalone",
  typescript: { ignoreBuildErrors: skipChecks },
  // The pnpm monorepo hoists deps to the repo root; tracing must start there
  // or the standalone output drops workspace dependencies.
  outputFileTracingRoot: path.join(__dirname, ".."),
  // PPMP supporting documents go through a server action; the API accepts up to
  // 10 MB (api/src/ppmp/ppmp.controller.ts), the default here is 1 MB. 11 MB
  // leaves room for the multipart envelope. nginx's client_max_body_size matches.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
  },
  async redirects() {
    // Two generations of naming point at the same page. 308 preserves any
    // indexed or external links — printed QR codes included — while
    // consolidating ranking signals on the current URL.
    //
    // Both older names target /budget **directly** rather than chaining
    // /registry → /aip → /budget: a redirect chain sheds signal at every hop and
    // costs the visitor a second round-trip.
    return [
      // The developers page replaced the /docs placeholder (#97). Both land on
      // its first tab directly rather than chaining /docs → /developers → tab.
      {
        source: '/docs',
        destination: '/developers/open-data',
        permanent: true, // 308
      },
      // /developers is only the parent of its two tabs. Temporary, so the
      // landing tab can change without browsers caching it.
      {
        source: '/developers',
        destination: '/developers/open-data',
        permanent: false, // 307
      },
      // Redirects match before the middleware strips a language prefix, so
      // /fil/developers needs its own or it 404s (specs/014).
      {
        source: '/:locale(fil|bcl)/developers',
        destination: '/:locale/developers/open-data',
        permanent: false, // 307
      },
      // /registry was an oversight serving identical content (D7).
      {
        source: '/registry',
        destination: '/budget',
        permanent: true, // 308
      },
      {
        source: '/registry/:path*',
        destination: '/budget/:path*',
        permanent: true, // 308
      },
      // /aip briefly redirected here, back when /budget was the only public
      // page. It is now the Annual Investment Program section's own front door,
      // so the bare redirect is gone — but the program links minted while it
      // pointed at /budget still have to land somewhere.
      //
      // Narrowed to a uuid-shaped segment on purpose. Next matches redirects
      // *before* routing, so a broad `/aip/:path*` would shadow every page under
      // /aip/2027/… and the section would be unreachable. A program id can only
      // be a uuid, and a fiscal year can never look like one, so the two never
      // collide.
      {
        source: `/aip/:programId(${UUID})`,
        destination: '/budget/:programId',
        permanent: true, // 308
      },
      {
        source: `/aip/:programId(${UUID})/:path*`,
        destination: '/budget/:programId/:path*',
        permanent: true, // 308
      },
    ];
  },
};

export default nextConfig;
