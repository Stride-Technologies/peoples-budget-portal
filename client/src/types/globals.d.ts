declare function gtag(
  command: 'config' | 'event' | 'js',
  target: string | Date,
  params?: Record<string, unknown>,
): void;
declare function gtag(
  command: 'consent',
  action: 'update' | 'default',
  params: Record<string, string>,
): void;
declare function gtag(command: 'set', params: Record<string, unknown>): void;

interface Window {
  gtag: typeof gtag;
  dataLayer: unknown[];
}
