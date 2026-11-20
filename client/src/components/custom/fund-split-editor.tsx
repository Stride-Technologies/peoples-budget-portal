'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/custom/currency-input';
import { SimpleSelect } from '@/components/custom/simple-select';
import { FUND_SOURCES, type FundAllocationLine } from '@/lib/schemas';
import { addDecimalStrings, formatPeso } from '@/lib/currency-formatter';

const CLASSES = ['ps', 'mooe', 'fe', 'co'] as const;
const CLASS_LABEL = { ps: 'PS', mooe: 'MOOE', fe: 'FE', co: 'CO' } as const;

export const emptyFundLine = (): FundAllocationLine => ({
  fundSource: '',
  ps: '0.00',
  mooe: '0.00',
  fe: '0.00',
  co: '0.00',
});

/** Σ of one expense class across the lines — what the row's own figure becomes. */
export const sumFundLines = (
  lines: FundAllocationLine[],
  k?: (typeof CLASSES)[number],
) =>
  addDecimalStrings(
    lines.flatMap((l) => (k ? [l[k]] : [l.ps, l.mooe, l.fe, l.co])),
  );

/**
 * A row's money split by fund: one line per fund, each with its own
 * PS / MOOE / FE / CO — the way the city's form writes a PPA that GF, SHF and GAA
 * pay for together. The row's PS/MOOE/FE/CO and fund list are the sums of these
 * lines (the server derives them too).
 */
export function FundSplitEditor({
  value,
  onChange,
  error,
}: Readonly<{
  value: FundAllocationLine[];
  onChange: (lines: FundAllocationLine[]) => void;
  error?: string;
}>) {
  const set = (i: number, patch: Partial<FundAllocationLine>) =>
    onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const taken = new Set(value.map((l) => l.fundSource));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs md:text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="pb-1 font-medium">Fund</th>
              {CLASSES.map((k) => (
                <th key={k} className="pb-1 text-right font-medium">
                  {CLASS_LABEL[k]}
                </th>
              ))}
              <th className="pb-1 text-right font-medium">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {value.map((line, i) => (
              <tr key={i} className="align-top">
                <td className="w-36 py-1 pr-2">
                  <SimpleSelect
                    aria-label={`Fund for line ${i + 1}`}
                    value={line.fundSource}
                    onChange={(fundSource) =>
                      set(i, { fundSource: fundSource as FundAllocationLine['fundSource'] })
                    }
                    placeholder="Choose a fund…"
                    error={!!error && !line.fundSource}
                    options={FUND_SOURCES.filter(
                      (f) => f.value === line.fundSource || !taken.has(f.value),
                    ).map(({ value: v, label, description }) => ({
                      value: v,
                      label,
                      description,
                    }))}
                  />
                </td>
                {CLASSES.map((k) => (
                  <td key={k} className="px-1 py-1">
                    <CurrencyInput
                      aria-label={`${CLASS_LABEL[k]} for line ${i + 1}`}
                      value={line[k]}
                      onChange={(v) => set(i, { [k]: v })}
                      onBlur={() => {
                        if (!line[k]?.trim()) set(i, { [k]: '0.00' });
                      }}
                      placeholder="0.00"
                      className="text-right font-mono"
                    />
                  </td>
                ))}
                <td className="py-1 pl-2 text-right font-mono whitespace-nowrap text-neutral-700">
                  {formatPeso(sumFundLines([line]))}
                </td>
                <td className="py-1 pl-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-medium">
              <td className="pt-2">All funds</td>
              {CLASSES.map((k) => (
                <td key={k} className="px-1 pt-2 text-right font-mono whitespace-nowrap">
                  {formatPeso(sumFundLines(value, k))}
                </td>
              ))}
              <td className="pt-2 pl-2 text-right font-mono whitespace-nowrap">
                {formatPeso(sumFundLines(value))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, emptyFundLine()])}
        disabled={value.length >= FUND_SOURCES.length}
      >
        <Plus className="mr-1 h-4 w-4" /> Add fund
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
