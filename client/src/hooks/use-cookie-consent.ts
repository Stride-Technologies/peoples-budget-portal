'use client';

import { useCallback, useSyncExternalStore } from 'react';

export const CONSENT_STORAGE_KEY = 'pbp_cookie_consent_v1';
const CONSENT_VERSION = '1';

export type ConsentPreferences = {
  analytics: boolean;
  decidedAt: string;
  version: string;
};

type ConsentHook = {
  consent: ConsentPreferences | null;
  isPending: boolean;
  forceShow: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  savePreferences: (prefs: { analytics: boolean }) => void;
  reopenBanner: () => void;
};

function readStored(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPreferences;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Module-level store — single source of truth shared across all hook instances.
// This is what makes CookieSettingsLink and CookieConsentBanner stay in sync.
type Snapshot = { consent: ConsentPreferences | null; hydrated: boolean; forceShow: boolean };

const _listeners = new Set<() => void>();
let _snap: Snapshot = { consent: null, hydrated: false, forceShow: false };

function _emit() {
  _listeners.forEach((fn) => fn());
}

function _subscribe(cb: () => void) {
  _listeners.add(cb);
  if (!_snap.hydrated) {
    // Hydrate on first client subscription, then notify to trigger re-render.
    queueMicrotask(() => {
      if (!_snap.hydrated) {
        _snap = { consent: readStored(), hydrated: true, forceShow: false };
        _emit();
      }
    });
  }
  return () => {
    _listeners.delete(cb);
  };
}

function _getSnapshot() {
  return _snap;
}

const _serverSnapshot: Snapshot = { consent: null, hydrated: false, forceShow: false };
function _getServerSnapshot(): Snapshot {
  return _serverSnapshot;
}

function _persist(prefs: { analytics: boolean }) {
  const next: ConsentPreferences = {
    analytics: prefs.analytics,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
  _snap = { consent: next, hydrated: true, forceShow: false };
  _emit();
}

export function useCookieConsent(): ConsentHook {
  const { consent, hydrated, forceShow } = useSyncExternalStore(
    _subscribe,
    _getSnapshot,
    _getServerSnapshot,
  );

  const acceptAll = useCallback(() => _persist({ analytics: true }), []);
  const rejectNonEssential = useCallback(() => _persist({ analytics: false }), []);
  const savePreferences = useCallback((prefs: { analytics: boolean }) => _persist(prefs), []);

  const reopenBanner = useCallback(() => {
    // Keep saved consent intact — only show the banner so the user can review/change it.
    // Preference only updates when they actively accept, reject, or save.
    _snap = { ..._snap, forceShow: true };
    _emit();
  }, []);

  return {
    consent,
    isPending: hydrated && consent === null,
    forceShow,
    acceptAll,
    rejectNonEssential,
    savePreferences,
    reopenBanner,
  };
}
