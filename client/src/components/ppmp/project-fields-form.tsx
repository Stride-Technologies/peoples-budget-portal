'use client';

import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { OfficeCombobox } from '@/components/custom/office-combobox';
import { SimpleSelect } from '@/components/custom/simple-select';
import { PPMP_CLASSIFICATIONS, type PpmpFormValues, type DepartmentOption } from '@/lib/schemas';

interface ProjectFieldsFormProps {
  control: Control<PpmpFormValues>;
  errors: FieldErrors<PpmpFormValues>;
  departments: DepartmentOption[];
  ownOrgId: string | null;
  loading?: boolean;
}

/**
 * The four fields shared by "New Project" (new-project-drawer.tsx) and
 * "Edit Project" (edit-project-drawer.tsx) — Office, Classification,
 * Project Name, Funding AIP Program — extracted so the two drawers can't
 * drift into two different field sets/validation.
 */
export default function ProjectFieldsForm({
  control,
  errors,
  departments,
  ownOrgId,
  loading,
}: Readonly<ProjectFieldsFormProps>) {
  const canChooseOffice = !ownOrgId || departments.length > 1;

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="officeId" className="text-xs font-medium text-slate-900 md:text-sm">
          Office
          <span className="text-destructive ml-0.5">*</span>
        </label>
        {canChooseOffice ? (
          <Controller<PpmpFormValues, 'officeId'>
            name="officeId"
            control={control}
            render={({ field }) => (
              <OfficeCombobox
                id="officeId"
                options={departments}
                value={field.value}
                onChange={field.onChange}
                disabled={loading}
                error={!!errors.officeId}
              />
            )}
          />
        ) : (
          <Input
            value={departments.find((d) => d.id === ownOrgId)?.name ?? ''}
            disabled
            className="h-11"
          />
        )}
        {errors.officeId && <p className="text-xs text-red-600">{errors.officeId.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="classification" className="text-xs font-medium text-slate-900 md:text-sm">
          Classification
          <span className="text-destructive ml-0.5">*</span>
        </label>
        <Controller<PpmpFormValues, 'classification'>
          name="classification"
          control={control}
          render={({ field }) => (
            <SimpleSelect
              id="classification"
              options={[...PPMP_CLASSIFICATIONS]}
              value={field.value ?? ''}
              onChange={field.onChange}
              error={!!errors.classification}
            />
          )}
        />
        {errors.classification && (
          <p className="text-xs text-red-600">{errors.classification.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-xs font-medium text-slate-900 md:text-sm">
          Project Name
          <span className="text-destructive ml-0.5">*</span>
        </label>
        <Controller<PpmpFormValues, 'name'>
          name="name"
          control={control}
          render={({ field }) => (
            <Input
              id="name"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. Repair of Library Reading Areas"
              className="h-11"
            />
          )}
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fundingProgram" className="text-xs font-medium text-slate-900 md:text-sm">
          Funding AIP Program
          <span className="text-destructive ml-0.5">*</span>
        </label>
        <Controller<PpmpFormValues, 'fundingProgram'>
          name="fundingProgram"
          control={control}
          render={({ field }) => (
            <Input
              id="fundingProgram"
              value={field.value}
              onChange={field.onChange}
              placeholder="Which AIP Program funds this Project?"
              className="h-11"
            />
          )}
        />
        {errors.fundingProgram && (
          <p className="text-xs text-red-600">{errors.fundingProgram.message}</p>
        )}
      </div>
    </>
  );
}
