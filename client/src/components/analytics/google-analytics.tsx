'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { useCookieConsent } from '@/hooks/use-cookie-consent';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  const { consent } = useCookieConsent();
  const granted = consent?.analytics === true;
  const prevGranted = useRef<boolean | null>(null);

  useEffect(() => {
    if (!GA_ID || typeof window === 'undefined') return;
    if (prevGranted.current === granted) return;
    prevGranted.current = granted;

    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
      });
    }
  }, [granted]);

  if (!GA_ID || !granted) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
