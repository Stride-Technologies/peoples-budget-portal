'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ProgramWithBudget } from '@/lib/schemas';
import { formatCurrency } from '@/lib/currency-formatter';
import { GOAL } from '@/lib/goal-label';


interface ParentProgramSummaryProps {
  program: ProgramWithBudget;
}

/**
 * Parent Program Summary
 * Compact contextual summary card anchoring user to parent program
 */
export default function ParentProgramSummary({ program }: ParentProgramSummaryProps) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="pt-4 md:pt-5 pb-4 md:pb-5">
        <div className="space-y-3">
          {/* Program Name */}
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Program
            </p>
            <p className="text-sm md:text-base font-semibold text-neutral-900">
              {program.programName}
            </p>
          </div>

          {/* AIP Code & Finish Line */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                AIP Code
              </p>
              <p className="text-xs font-mono text-neutral-700">
                {program.aipReferenceCode}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                {GOAL}
              </p>
              <p className="text-xs text-neutral-700">
                {program.primaryFinishLineName}
              </p>
            </div>
          </div>

          {/* Budget Ceiling */}
          <div className="border-t border-neutral-200 pt-3">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Budget Ceiling
            </p>
            <p className="text-sm font-semibold text-neutral-900">
              {formatCurrency(program.budgetCeiling)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
