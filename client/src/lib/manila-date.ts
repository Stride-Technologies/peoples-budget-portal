/**
 * A date as the city reads it: "October 27, 2026", in Asia/Manila whatever the
 * server's or visitor's zone. A timestamp just after midnight Manila time is
 * still the previous day in UTC, so formatting without the zone shows the
 * wrong day for part of every day.
 */
export function formatManilaDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
