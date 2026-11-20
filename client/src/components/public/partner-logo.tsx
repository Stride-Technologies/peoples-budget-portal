'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * A partner's logo, or nothing at all if the file is missing.
 *
 * `next/image` renders a broken-image glyph when the source 404s, which looks
 * like a bug rather than an absence. On error this keeps the box but draws
 * nothing in it, so the row still lines up with its neighbours and the block
 * degrades to the organisation's name — a wordmark, which is a legitimate way to
 * credit someone. Dropping the box entirely instead left the logo-less rows
 * indented differently from the one that had a mark.
 *
 * It exists because two of the three marks are supplied separately: only NCPC
 * ships in this repo (cropped from `public/Logos.png`).
 */
export function PartnerLogo({
  src,
  height = 44,
  width = 112,
  scale = 1,
  className,
}: {
  src: string;
  height?: number;
  width?: number;
  /** Optical correction: a dense solid mark reads heavier at the same box. */
  scale?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={className ?? 'flex shrink-0 items-center justify-center'}
      style={{ width, height }}
    >
      {!failed && (
        // ponytail: the slot is a fixed box every mark is centred in, so the
        // names beside them still line up; the mark itself is sized by its own
        // aspect within it. A square box shrank the 3:1 wesolve wordmark to a
        // third the optical mass of the two squarish seals.
        <Image
          src={src}
          alt=""
          width={width}
          height={height}
          className="object-contain"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: width * scale,
            maxHeight: height * scale,
          }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
