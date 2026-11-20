import { Transform } from 'class-transformer';

/**
 * Lowercases and trims an incoming email before validation/lookup.
 *
 * Every `User.email` write and read in this module used the raw client value
 * verbatim — nothing normalized case, so `Admin@Example.gov.ph` and
 * `admin@example.gov.ph` were two different rows to Postgres's default
 * case-sensitive `@unique` index, and a login typed in different casing than
 * the stored row failed with the same "Invalid credentials" message as a
 * wrong password. Apply this on every DTO field that reads or writes
 * `User.email` (login, invite, verify, resend, forgot-password) so lookups
 * and new rows are consistently lowercase.
 */
export function NormalizeEmail() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
