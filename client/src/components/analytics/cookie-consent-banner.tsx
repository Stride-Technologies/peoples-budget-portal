'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCookieConsent } from '@/hooks/use-cookie-consent';
import { cn } from '@/lib/utils';

// Matches the 5-second delayed reveal used in the Stride website banner.
const REVEAL_DELAY_MS = 5000;

export function CookieConsentBanner() {
  const { consent, isPending, forceShow, acceptAll, rejectNonEssential, savePreferences } = useCookieConsent();
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(true);

  // SSR-safe mount detection — false on server, true after hydration.
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!hasMounted) return;
    if (forceShow) {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    if (isPending) {
      const t = setTimeout(() => setVisible(true), REVEAL_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible(false), 0);
    return () => clearTimeout(t);
  }, [hasMounted, isPending, forceShow]);

  // Sync checkbox to saved preference whenever the banner (re)opens.
  useEffect(() => {
    if (visible && consent !== null) {
      const val = consent.analytics;
      const t = setTimeout(() => setAnalyticsChecked(val), 0);
      return () => clearTimeout(t);
    }
  }, [visible, consent]);

  const handleSave = () => {
    savePreferences({ analytics: analyticsChecked });
  };

  if (!hasMounted || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      aria-modal="false"
      className={cn(
        'fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-700',
      )}
      style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {/* One card, not three nested ones. The original was an outer pill wrapping
          a gradient-border div wrapping a blurred card — three radii and a faked
          border to approximate a surface the editorial palette now provides
          outright. */}
      <div className="rounded-2xl border border-rule bg-paper-raised/95 p-4 shadow-xl backdrop-blur">
          <div>
            {/* Manage panel — only shown when expanded */}
            {managing && (
              <div className="mb-4 rounded-xl border border-rule bg-paper-tint p-4">
                <p className="mb-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
                  Manage cookie preferences
                </p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-analytics"
                    checked={analyticsChecked}
                    onCheckedChange={(v) => setAnalyticsChecked(v === true)}
                    // The shared checkbox is blue-600, which is the one cool
                    // accent left on the public pages. Overridden here rather
                    // than in the component, which the staff app relies on.
                    className="mt-0.5 border-rule accent-ink text-ink focus:ring-ink/30"
                  />
                  <label htmlFor="consent-analytics" className="cursor-pointer space-y-0.5">
                    <p className="text-sm font-medium text-ink">
                      Analytics (Google Analytics 4)
                    </p>
                    <p className="text-xs leading-6 text-ink-muted">
                      Helps us understand how visitors navigate the portal so we can improve
                      the public experience. Data is anonymized and processed by Google LLC.
                    </p>
                  </label>
                </div>
              </div>
            )}

            {/* Banner row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Your privacy</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  We use cookies to understand how visitors use this portal. By clicking &quot;Accept all&quot;, you consent to the use of all cookies. You can manage your preferences or learn more in our{" "}
                  <Link
                    href="/privacy-policy#data-collected"
                    className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
                  >
                    Privacy Policy
                  </Link>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {managing ? (
                  <>
                    <button
                      onClick={() => setManaging(false)}
                      className="flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      Hide
                    </button>
                    <Button variant="editorial" size="sm" onClick={handleSave} className="text-xs">
                      Save preferences
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setManaging(true)}
                      className="flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      Manage
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={rejectNonEssential}
                      className="text-xs"
                    >
                      Reject
                    </Button>
                    <Button
                      variant="editorial"
                      size="sm"
                      onClick={acceptAll}
                      className="text-xs"
                    >
                      Accept all
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
      </div>
    </div>

  );
}

export function CookieSettingsLink() {
  const { reopenBanner } = useCookieConsent();
  return (
    <button
      onClick={reopenBanner}
      className="text-xs text-paper/50 transition-colors hover:text-paper"
    >
      Cookie Settings
    </button>
  );
}
