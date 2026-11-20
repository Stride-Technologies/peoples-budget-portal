import type { MetadataRoute } from 'next';
import { isProd } from '@/lib/site-env';
import { SITE_URL } from '@/lib/seo';

// AI crawlers allowed on prod so the portal is citable by AI assistants (D8).
// Non-prod returns Disallow: / so staging/preview is never indexed (D4).
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'CCBot',
  'Google-Extended',
  'Amazonbot',
  'Applebot-Extended',
];

const PUBLIC_ALLOW = [
  '/',
  '/aip',
  '/aip/',
  '/annual',
  '/annual/',
  '/budget',
  '/budget/',
  '/ppmp',
  '/ppmp/',
  '/learn',
  '/license',
  '/privacy-policy',
  '/terms',
  '/_next/static/',
];

const PROTECTED_DISALLOW = [
  '/login',
  '/dashboard',
  '/programs',
  '/control-panel',
  '/ppmp-registry',
  '/api/',
  '/_next/',
];

export default function robots(): MetadataRoute.Robots {
  if (!isProd) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW,
        disallow: PROTECTED_DISALLOW,
      },
      // Explicitly allow AI crawlers so the portal is citable by AI assistants.
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: PUBLIC_ALLOW,
        disallow: PROTECTED_DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
