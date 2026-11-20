'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ProgramWithBudget } from '@/lib/schemas';

interface ContextHeaderProps {
  program: ProgramWithBudget;
}

/**
 * Context Header
 * Quick reference for parent program
 */
export default function ContextHeader({ program }: ContextHeaderProps) {
  return (
    <Card className="border-slate-200 bg-slate-50">
      <CardContent className="pt-4 pb-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Parent Program
          </p>
          <p className="text-sm font-semibold text-slate-950">
            {program.programName}
          </p>
          <p className="text-xs text-slate-600">
            AIP Code: <span className="font-mono font-medium">{program.aipReferenceCode}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
