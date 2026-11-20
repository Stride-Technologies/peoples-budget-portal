'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SpecialFundRecord } from '@/lib/api';
import { formatPeso } from '@/lib/currency-formatter';
import { setSpecialFundAmount } from '../_actions';
import { SpecialFundFlag } from '@/components/aip/special-funds-notice';

/**
 * Special funds' stated amounts for this cycle (specs/008 US5), by fund since
 * specs/016. Printed on LBP Form 7 as lump sums when no row carries the fund,
 * and shown on the staff dashboard with a flag. Never in public totals or open
 * data.
 */
export function SpecialFundsEditor({
  cycleId,
  funds,
}: {
  cycleId: string;
  funds: SpecialFundRecord[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(funds.map((f) => [f.fund, f.statedAmount ?? ''])),
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null);

  const save = (fund: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await setSpecialFundAmount(cycleId, fund, values[fund] ?? '');
      setMessage(
        'error' in result
          ? { kind: 'error', text: result.error }
          : { kind: 'success', text: result.success },
      );
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fund</th>
              <th className="px-3 py-2 text-right font-medium">Programs</th>
              <th className="px-3 py-2 font-medium">Stated amount (₱)</th>
              <th className="px-3 py-2 text-right font-medium">Form 7 prints</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {funds.map((fund) => (
              <tr key={fund.fund} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-neutral-900">{fund.fund}</p>
                  <p className="text-xs text-neutral-500">{fund.name}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {fund.programCount > 0
                    ? `${fund.programCount} · ${formatPeso(fund.programTotal)}`
                    : 'none'}
                </td>
                <td className="px-3 py-2">
                  <Input
                    aria-label={`Stated amount for ${fund.fund}`}
                    inputMode="decimal"
                    value={values[fund.fund] ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [fund.fund]: e.target.value }))
                    }
                    placeholder="Not stated"
                    className="font-mono"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <p className="tabular-nums whitespace-nowrap">{formatPeso(fund.figure)}</p>
                  {fund.flags.map((flag) => (
                    <SpecialFundFlag key={flag} flag={flag} />
                  ))}
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => save(fund.fund)}
                  >
                    Save
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-prose text-xs text-neutral-500">
        Programs counts every office&apos;s rows whose fund source is this fund.
        When there are any, their sum is what Form 7 prints and a different
        stated amount is flagged. Leave blank and save to clear.
      </p>
      {message && (
        <p
          className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-green-700'}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
