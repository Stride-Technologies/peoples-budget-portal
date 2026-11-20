'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface FooterActionsProps {
  isSubmitting: boolean;
  isDirty: boolean;
  entryType: 'project' | 'activity';
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * Footer Actions
 * Sticky footer with Cancel and Save buttons
 */
export default function FooterActions({
  isSubmitting,
  entryType,
  onCancel,
  onSubmit,
}: FooterActionsProps) {
  return (
    <div className="flex gap-3 justify-between">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onSubmit}
        disabled={isSubmitting}
        className="gap-2"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Save {entryType === 'project' ? 'Project' : 'Activity'}
      </Button>
    </div>
  );
}
