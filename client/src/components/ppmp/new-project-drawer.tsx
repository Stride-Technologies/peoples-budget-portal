'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ProjectFieldsForm from './project-fields-form';
import { ppmpSchema, type PpmpFormValues, type DepartmentOption } from '@/lib/schemas';
import { loadPpmpReference, submitNewPpmp } from '@/app/ppmp-registry/new/_actions';

interface NewProjectDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful save, with the new Project's id. */
  onCreated: (id: string) => void;
}

/**
 * "New Project" as an in-place drawer — mirrors ProjectOverviewDrawer's
 * Sheet shell and blue sticky header instead of navigating to a separate
 * `/ppmp-registry/new` page (which this replaces).
 */
export default function NewProjectDrawer({ open, onClose, onCreated }: Readonly<NewProjectDrawerProps>) {
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [ownOrgId, setOwnOrgId] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PpmpFormValues>({
    resolver: zodResolver(ppmpSchema),
    defaultValues: { officeId: '', name: '', fundingProgram: '' },
  });

  useEffect(() => {
    if (!open) return;
    // Every setState call below is nested inside this async boundary, not a
    // synchronous statement in the effect body — avoids
    // `react-hooks/set-state-in-effect` (same pattern as public-program-
    // drawer.tsx's data-fetch effect).
    void (async () => {
      setLoading(true);
      setSubmitError(undefined);
      reset({ officeId: '', name: '', fundingProgram: '' });
      const result = await loadPpmpReference();
      if ('error' in result) {
        setReferenceError(result.error);
      } else {
        setDepartments(result.data.departments);
        setOwnOrgId(result.data.ownOrgId);
        if (result.data.ownOrgId) setValue('officeId', result.data.ownOrgId);
      }
      setLoading(false);
    })();
    // Refetch reference data and reset the form every time the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit(async (data) => {
    setIsSubmitting(true);
    setSubmitError(undefined);
    const result = await submitNewPpmp(data);
    setIsSubmitting(false);
    if ('error' in result) {
      setSubmitError(result.error);
      return;
    }
    onCreated(result.id);
  });

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col p-0 data-[side=right]:sm:max-w-lg"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-blue-600 px-6 py-3 text-white shadow-sm">
          <span className="text-[9px] font-normal tracking-[0.11em] text-blue-100">
            NEW PROJECT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-blue-700/40"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4 text-blue-100" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:space-y-5 md:p-6">
          {referenceError && (
            <Alert variant="destructive">
              <AlertDescription>{referenceError}</AlertDescription>
            </Alert>
          )}
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <ProjectFieldsForm
            control={control}
            errors={errors}
            departments={departments}
            ownOrgId={ownOrgId}
            loading={loading}
          />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3 md:px-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting || loading}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving…' : 'Save Project'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
