// reCAPTCHA v3 — loaded lazily only when feedback surfaces open (D15).
// Treated as essential/security, not analytics — loads regardless of
// cookie-consent state (D14).

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

export function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return scriptLoading;
}

export async function executeRecaptcha(
  siteKey: string,
  action: string,
): Promise<string> {
  await loadRecaptchaScript(siteKey);
  return new Promise<string>((resolve, reject) => {
    // `grecaptcha` is absent whenever the script was blocked (ad blocker,
    // offline, CSP) — including the case where `scriptLoaded` is stale from an
    // earlier load in the same tab. Check before touching it, or the throw
    // escapes the executor and the promise never settles.
    if (typeof window.grecaptcha?.ready !== 'function') {
      reject(new Error('reCAPTCHA failed to load'));
      return;
    }
    try {
      window.grecaptcha.ready(() => {
        // Previously `.then(resolve)` with no rejection path: a failing
        // execute() left this promise pending forever and the submit button
        // span forever.
        window.grecaptcha
          .execute(siteKey, { action })
          .then(resolve)
          .catch(reject);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
