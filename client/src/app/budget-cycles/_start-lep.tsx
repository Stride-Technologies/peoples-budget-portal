'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseMoneyInput } from '@/lib/money-input';
import { carryForwardLep } from './_actions';

/**
 * Start a year's draft LEP. The first step is the total the city can
 * appropriate; the LEP is then carried forward from the adopted AIP and
 * measured against it (over is a warning, not a block).
 */
export function StartLepButton({ aipCycleId, fiscalYear }: { aipCycleId: string; fiscalYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const amount = parseMoneyInput(raw);

  const start = () =>
    amount &&
    startTransition(async () => {
      setError(null);
      const r = await carryForwardLep(aipCycleId, amount);
      if ('error' in r) return setError(r.error);
      router.push(`/budget-cycles/${r.fiscalYear}/documents/${r.documentId}${r.listed ? '?tab=review' : ''}`);
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Start the FY{fiscalYear} LEP
      </Button>
      <Dialog open={open} onOpenChange={(o) => !isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start the FY{fiscalYear} LEP</DialogTitle>
            <DialogDescription>
              First, the total allocable budget: what the LGU can appropriate for {fiscalYear}, from
              its estimated income and available resources. The draft LEP is then made from the
              adopted AIP and checked against it.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Total allocable budget (₱)</span>
            <Input
              inputMode="decimal"
              placeholder="2,600,000,000.00"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && start()}
              autoFocus
            />
            {raw && !amount && (
              <span className="block text-xs text-red-600">Enter an amount in pesos, like 2,600,000,000.00</span>
            )}
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!amount || isPending}>
              {isPending ? 'Starting…' : 'Start the LEP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
