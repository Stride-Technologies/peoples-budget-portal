'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { acknowledgeBudgetItem, finalizeBudgetDocument } from '../../../_actions';
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

export function AcknowledgeButton({ documentId, itemId }: { documentId: string; itemId: string }) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await acknowledgeBudgetItem(documentId, itemId, pathname);
            setError('error' in r ? r.error : null);
          })
        }
      >
        {isPending ? 'Saving…' : 'Mark reviewed'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Enact an Ordinance (or submit an LEP). The API refuses while any PPA still
 * needs import review, and nothing can be edited afterwards.
 */
export function FinalizeButton({
  documentId,
  kind,
  fiscalYear,
  blocked,
}: {
  documentId: string;
  kind: 'LEP' | 'ORDINANCE';
  fiscalYear: number;
  blocked: number;
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = kind === 'ORDINANCE' ? 'Enact' : 'Submit';
  return (
    <div className="space-y-2">
      <AlertDialog>
        <AlertDialogTrigger render={<Button disabled={isPending || blocked > 0} />}>
          {isPending ? 'Saving…' : `${label} this ${kind === 'ORDINANCE' ? 'Ordinance' : 'LEP'}`}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {label} the FY{fiscalYear} {kind === 'ORDINANCE' ? 'Ordinance' : 'LEP'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {kind === 'ORDINANCE'
                ? 'It becomes the enacted budget: the public site and open data show it, and it can no longer be changed.'
                : 'It is recorded as submitted to the Sanggunian and can no longer be changed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const r = await finalizeBudgetDocument(documentId, pathname);
                  setError('error' in r ? r.error : null);
                })
              }
            >
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {blocked > 0 && (
        <p className="text-xs text-amber-700">
          {blocked === 1 ? '1 PPA still needs' : `${blocked} PPAs still need`} import review before this can be{' '}
          {kind === 'ORDINANCE' ? 'enacted' : 'submitted'}.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
