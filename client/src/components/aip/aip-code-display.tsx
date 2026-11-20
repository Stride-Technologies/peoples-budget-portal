'use client';

import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The city's 7-segment LGU format. There is no subsector segment: the
 * realignment replaced it with PAP Class, which is why the old caption named
 * seven parts but shifted every one of them a slot to the right. Exported
 * because the project/activity form kept its own drifting copy.
 * See api/docs/aip-reference.md §7.
 */
export const AIP_CODE_FORMAT_HINT =
  'Format: Sector - LGU Level - Office Type - Office - PAP Class - Program - Project/Activity';

interface AIPCodeDisplayProps {
  code?: string;
  isLoading?: boolean;
  hasError?: boolean;
  emptyText?: string;
  helperText?: string;
  className?: string;
}

/**
 * Display component for auto-generated AIP reference codes
 * Includes copy-to-clipboard functionality and loading state
 */
export default function AIPCodeDisplay({
  code,
  isLoading = false,
  hasError = false,
  emptyText = 'Select department and sector to generate',
  helperText = AIP_CODE_FORMAT_HINT,
  className,
}: AIPCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (code) {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex-1 rounded-md border border-neutral-200 px-3 py-2 text-sm font-mono',
            isLoading && 'bg-neutral-50 text-neutral-400',
            hasError && 'border-red-300 bg-red-50 text-red-700',
            !isLoading && !hasError && code && 'bg-neutral-50 text-neutral-500 cursor-not-allowed',
            !isLoading && !hasError && !code && 'bg-neutral-50 text-neutral-400'
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
            </div>
          ) : code ? (
            code
          ) : (
            <span className="text-neutral-400">{emptyText}</span>
          )}
        </div>

        {code && !isLoading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="whitespace-nowrap"
            aria-label="Copy AIP code to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Copy</span>
              </>
            )}
          </Button>
        )}
      </div>

      {helperText && (
        <p className="text-xs text-neutral-500">{helperText}</p>
      )}
    </div>
  );
}
