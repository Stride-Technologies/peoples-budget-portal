/**
 * The number or phrase a claim actually turns on.
 *
 * A display-sized sentence gives the eye no entry point — "45 of 63 offices have
 * published so far" reads as one grey mass at 44px. Marking the figure gives the
 * reader something to land on, and it ties the sentence to the colour already
 * carrying that section on its step number and rule.
 *
 * `underline` is the variant for a phrase rather than a figure: a coloured rule
 * beneath, which reads as emphasis without a second block of colour in the line.
 *
 * Presentational only — the sentence says the same thing without it, so nothing
 * here is announced.
 */
export function Mark({
  children,
  color,
  variant = 'text',
}: {
  children: React.ReactNode;
  /** The section's accent. Falls back to ink so it is never invisible. */
  color?: string;
  variant?: 'text' | 'underline';
}) {
  if (variant === 'underline') {
    return (
      <span
        className="underline decoration-[0.14em] underline-offset-[0.14em]"
        style={{ textDecorationColor: color ?? 'var(--ink)' }}
      >
        {children}
      </span>
    );
  }
  return <span style={{ color: color ?? 'var(--ink)' }}>{children}</span>;
}
