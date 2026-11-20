'use client';

import { useTransition, useState } from 'react';
import { transitionCycleStatus } from '../_actions';
import type { AipCycleStatus } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const NEXT_STATUS: Partial<Record<AipCycleStatus, { target: AipCycleStatus; label: string; confirmMsg: string }>> = {
  PLANNING: {
    target: 'OPEN',
    label: 'Open for Submissions',
    confirmMsg: 'This will open the cycle for program submissions. Make sure all budget ceilings are set. Continue?',
  },
  OPEN: {
    target: 'CLOSED',
    label: 'Close Submissions',
    confirmMsg: 'This will close the cycle to new submissions. Programs already submitted will continue through the workflow. Continue?',
  },
  CLOSED: {
    target: 'ADOPTED',
    label: 'Adopt AIP',
    confirmMsg:
      'This marks the AIP final for the year: no more programs can be added. It needs every program published — drafts and unpublished revisions block it. The year becomes an Annual Budget only when its Ordinance is enacted, not now. Continue?',
  },
};

export function StatusTransition({ cycleId, currentStatus }: { cycleId: string; currentStatus: AipCycleStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[currentStatus];
  if (!next) return null;

  function handleTransition() {
    setError(null);
    startTransition(async () => {
      const result = await transitionCycleStatus(cycleId, next!.target);
      if ('error' in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <AlertDialog>
        <AlertDialogTrigger render={<Button disabled={isPending} variant="outline" />}>
          {isPending ? 'Updating…' : next.label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{next.label}</AlertDialogTitle>
            <AlertDialogDescription>{next.confirmMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransition}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
