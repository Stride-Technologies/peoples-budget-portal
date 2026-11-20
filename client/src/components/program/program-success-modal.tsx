'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProgramSuccessModalProps {
  isOpen: boolean;
  programName?: string;
  onAddProject?: () => void;
  onReturnToRegistry?: () => void;
}

/**
 * Modal shown after successful program creation
 * Offers next steps: Add Project or Return to Registry
 */
export default function ProgramSuccessModal({
  isOpen,
  programName,
  onAddProject,
  onReturnToRegistry,
}: ProgramSuccessModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-3">
            <Check className="h-6 w-6 text-green-600" />
          </div>
        </div>

        <DialogHeader className="text-center">
          <DialogTitle>Program Created Successfully</DialogTitle>
          <DialogDescription className="mt-2">
            <div className="space-y-2">
              <p>
                {programName && <strong>{programName}</strong>} has been created and saved as Draft.
              </p>
              <p className="text-sm">Next step: Add Projects and Activities under this Program to define budget scope.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button
            variant="outline"
            onClick={onReturnToRegistry}
            className="flex-1"
          >
            Return to Registry
          </Button>
          <Button
            onClick={onAddProject}
            className="flex-1"
          >
            + Add Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
