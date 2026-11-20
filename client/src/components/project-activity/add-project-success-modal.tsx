'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle } from 'lucide-react';

interface AddProjectSuccessModalProps {
  open: boolean;
  programName: string;
  entryType: 'project' | 'activity';
  entryName?: string;
  onAddAnother: () => void;
  /** Replaces the default `router.push('/aip-registry')` on "Return to
   * Registry" — the drawer host passes a close callback instead. */
  onNavigateAway?: () => void;
}

export default function AddProjectSuccessModal({
  open,
  programName,
  entryType,
  entryName,
  onAddAnother,
  onNavigateAway,
}: Readonly<AddProjectSuccessModalProps>) {
  const router = useRouter();
  const navigateAway = onNavigateAway ?? (() => router.push('/aip-registry'));

  const entryLabel = entryType === 'project' ? 'Project' : 'Activity';

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-green-100 rounded-full blur-xl opacity-30" />
              <CheckCircle className="h-12 w-12 text-green-600 relative" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg">
            {entryLabel} Created Successfully
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            <p className="font-medium text-neutral-900 mb-1">
              {entryName}
            </p>
            <p className="text-sm">
              has been added to <span className="font-medium">{programName}</span>
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
          <p className="text-xs font-medium text-blue-900 mb-2">What&apos;s next?</p>
          <ul className="text-xs text-blue-800 space-y-1.5">
            <li className="flex gap-2">
              <span className="text-blue-600 font-bold">1.</span>
              <span>Add more projects or activities to this program</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600 font-bold">2.</span>
              <span>Tag climate change expenditures if applicable</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600 font-bold">3.</span>
              <span>Submit the program for approval when all entries are complete</span>
            </li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigateAway()}
            className="w-full sm:flex-1"
          >
            Return to Registry
          </Button>
          <Button
            type="button"
            onClick={onAddAnother}
            className="w-full sm:flex-1"
          >
            Add Another
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
