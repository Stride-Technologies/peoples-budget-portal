/**
 * A random per-device key (R17): lets the API count one device's verdicts and
 * questions without identifying anyone. No cookie; absent in a private window.
 */
export function deviceKey(): string | undefined {
  try {
    let k = localStorage.getItem('explore-device');
    if (!k) localStorage.setItem('explore-device', (k = crypto.randomUUID()));
    return k;
  } catch {
    return undefined;
  }
}
