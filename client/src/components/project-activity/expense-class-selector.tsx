'use client';

import { Control, useWatch } from 'react-hook-form';
import { AddProjectActivityFormData } from '@/lib/schemas';
import { cn } from '@/lib/utils';

interface ExpenseClassSelectorProps {
  control: Control<AddProjectActivityFormData>;
}

/**
 * Expense Class Selector
 * Segmented control for PS / MOOE / FE / CO selection
 */
export default function ExpenseClassSelector({
  control,
}: ExpenseClassSelectorProps) {
  const lineItems = useWatch({ control, name: 'lineItems' }) || [];
  const selectedClass = lineItems[0]?.expenseClass || 'MOOE';

  const expenseClassLabels = {
    PS: 'Personnel Services',
    MOOE: 'Maintenance & Operating',
    FE: 'Financial Expenses',
    CO: 'Capital Outlay',
  } as const;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {(['PS', 'MOOE', 'FE', 'CO'] as const).map((expenseClass) => {
          const isActive = selectedClass === expenseClass;
          const colors = {
            PS: 'bg-blue-50 border-blue-200 text-blue-900',
            MOOE: 'bg-teal-50 border-teal-200 text-teal-900',
            FE: 'bg-violet-50 border-violet-200 text-violet-900',
            CO: 'bg-orange-50 border-orange-200 text-orange-900',
          };
          const activeColors = {
            PS: 'bg-blue-100 border-blue-400',
            MOOE: 'bg-teal-100 border-teal-400',
            FE: 'bg-violet-100 border-violet-400',
            CO: 'bg-orange-100 border-orange-400',
          };

          return (
            <button
              key={expenseClass}
              type="button"
              className={cn(
                'flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors sm:px-5',
                colors[expenseClass],
                isActive && activeColors[expenseClass]
              )}
            >
              <span className="text-sm font-semibold leading-none">
                {expenseClass} — {expenseClassLabels[expenseClass]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
