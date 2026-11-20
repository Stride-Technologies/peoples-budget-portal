'use client';

import { Controller, Control, FieldErrors, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleSelect } from '@/components/custom/simple-select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import AIPCodeDisplay, { AIP_CODE_FORMAT_HINT } from '../aip/aip-code-display';
import { DepartmentOption, ReferenceOption, NewProgramFormValues, PAP_CLASSES } from '@/lib/schemas';
import { cn, titleCaseName } from '@/lib/utils';
import { OfficeCombobox } from '@/components/custom/office-combobox';
import { OfficeMultiSelect } from '@/components/custom/office-multi-select';
import { OfficePickerList, type PickedOffice } from '@/components/custom/office-picker-list';
import { Checkbox } from '@/components/ui/checkbox';
import { MonthYearPicker, monthYearFromFields } from '@/components/custom/month-year-picker';

interface ProgramIdentitySectionProps {
  control: Control<NewProgramFormValues>;
  /** Offices the caller may pick as the implementing office (scope-filtered). */
  departments: DepartmentOption[];
  offices: ReferenceOption[];
  ownOrgId: string | null;
  sectors: ReferenceOption[];
  aipCode?: string;
  isGeneratingCode: boolean;
  codeGenerationError?: string;
  departmentsLoading: boolean;
  sectorsLoading: boolean;
  errors: FieldErrors<NewProgramFormValues>;
  fiscalYear?: number | null;
  locked?: boolean;
  /**
   * When true (the super-admin create path, where the caller has no own org),
   * the multi-select *is* the implementing-office picker: the single-select
   * department dropdown is hidden, at least one office is required, and the
   * first selected office becomes the primary that drives the (locked) sector.
   */
  officeListIsImplementing?: boolean;
  /**
   * 'card' (default) renders the original bordered-card layout, used by the
   * full-page create form and the in-place edit drawer (`ProgramForm`).
   * 'drawer' renders the flat, numbered-section layout the New Program
   * drawer uses — same fields and wiring, split across `part`.
   */
  variant?: 'card' | 'drawer';
  /** Only read when `variant="drawer"`: which half of this section to render. */
  part?: 'identity' | 'office';
}

/**
 * Section 1: Program Identity
 * Collects department, sector, program name, and auto-generates AIP reference code
 */
export default function ProgramIdentitySection({
  control,
  departments,
  offices,
  ownOrgId,
  sectors,
  aipCode,
  isGeneratingCode,
  codeGenerationError,
  departmentsLoading,
  sectorsLoading,
  errors,
  fiscalYear,
  locked,
  officeListIsImplementing,
  variant = 'card',
  part = 'identity',
}: Readonly<ProgramIdentitySectionProps>) {
  const selectedSector = useWatch({ control, name: 'sectorId' });
  const selectedSectorLabel = sectors.find((sector) => sector.id === selectedSector);
  const selectedDepartmentId = useWatch({ control, name: 'departmentId' }) as string;

  // `departments` is already scoped to the offices the caller may implement for.
  // More than one means the office is a choice, not a given — show the picker
  // instead of locking their home office in.
  const canChooseOffice =
    !officeListIsImplementing && (!ownOrgId || departments.length > 1);
  const primaryOfficeId = officeListIsImplementing
    ? undefined
    : selectedDepartmentId || ownOrgId || undefined;

  const implementingOffice = primaryOfficeId
    ? departments.find((d) => d.id === primaryOfficeId)
    : undefined;
  // Programs are LGU-only (NCPC proponent track retired): supporting offices
  // exclude the implementing office.
  const supportableOffices = offices.filter((o) => o.id !== primaryOfficeId);

  // The host is picked from the full catalog rather than the caller's scope: it
  // is usually the parent office, which a sub-unit's staff do not implement for.
  //
  // The program's own office stays in the list on purpose. Self-hosting is the
  // city's `004` bucket — an office listing a program in its own sheet's
  // COMPONENT PROGRAMS band instead of under GAS/STO/Operations, as CSWDO does
  // for Paskohan sa Barangay. It prints in the band rather than a section, so
  // nothing appears twice.
  const isComponentProgram = useWatch({ control, name: 'isComponentProgram' });
  const hostableOffices = offices;

  // The sector is auto-assigned (and locked) whenever an implementing office
  // drives it: a staff member's own org, or — for super admins — the primary
  // office chosen from the multi-select (mirrored into `departmentId` upstream).
  const sectorSourceOfficeId = selectedDepartmentId || ownOrgId || undefined;
  const sectorSourceOffice = sectorSourceOfficeId
    ? departments.find((d) => d.id === sectorSourceOfficeId)
    : undefined;
  // An office the city's coding sheet leaves without a PAP sector can't drive
  // one. While nothing is picked yet the read-only display is right ("Pending
  // office selection"); once such an office *is* picked, hand over the dropdown
  // — read-only there dead-ends the form with no way to proceed.
  const officeHasNoSector = !!sectorSourceOffice && !sectorSourceOffice.defaultSectorCode;
  const sectorAutoAssigned =
    (!!ownOrgId || !!officeListIsImplementing) && !officeHasNoSector;

  if (variant === 'drawer') {
    return part === 'office' ? (
      <DrawerOfficeFields
        control={control}
        departments={departments}
        offices={offices}
        supportableOffices={supportableOffices}
        officeListIsImplementing={officeListIsImplementing}
        canChooseOffice={canChooseOffice}
        primaryOfficeId={primaryOfficeId}
        implementingOffice={implementingOffice}
        departmentsLoading={departmentsLoading}
        errors={errors}
        sectors={sectors}
        selectedSectorLabel={selectedSectorLabel}
        sectorsLoading={sectorsLoading}
        sectorAutoAssigned={sectorAutoAssigned}
        officeHasNoSector={officeHasNoSector}
        sectorSourceOffice={sectorSourceOffice}
        aipCode={aipCode}
        isGeneratingCode={isGeneratingCode}
        codeGenerationError={codeGenerationError}
      />
    ) : (
      <DrawerIdentityFields
        control={control}
        errors={errors}
        fiscalYear={fiscalYear}
        locked={locked}
        isComponentProgram={isComponentProgram}
        hostableOffices={hostableOffices}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Main Card */}
      <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="font-heading text-lg font-semibold text-slate-950">Program Identity</CardTitle>
          <CardDescription>
            Basic program information and strategic classification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-5">
          {/* Component program — the program is budgeted under another office's
              printed AB sheet, in that sheet's COMPONENT PROGRAMS band (City
              Health Office II under CHO, OSCA under CSWDO). It keeps its own
              office and its own AIP code; only where it prints changes. */}
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-start gap-2.5">
              <Controller<NewProgramFormValues, 'isComponentProgram'>
                name="isComponentProgram"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="isComponentProgram"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={locked}
                    className="mt-0.5 h-4 w-4"
                  />
                )}
              />
              <label htmlFor="isComponentProgram" className="text-xs md:text-sm text-slate-900">
                This is a <span className="font-medium">component program</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  It appears under another office&rsquo;s AB sheet. Its AIP code still uses
                  its own office.
                </span>
              </label>
            </div>

            {isComponentProgram && (
              <div className="space-y-1.5 pl-6">
                <label htmlFor="hostOfficeId" className="text-xs md:text-sm font-medium text-slate-900">
                  Appears under
                  <span className="text-destructive ml-0.5">*</span>
                </label>
                <Controller<NewProgramFormValues, 'hostOfficeId'>
                  name="hostOfficeId"
                  control={control}
                  render={({ field }) => (
                    <OfficeCombobox
                      id="hostOfficeId"
                      options={hostableOffices}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="Select the host office…"
                      disabled={locked}
                      error={!!errors.hostOfficeId}
                    />
                  )}
                />
                {errors.hostOfficeId && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{errors.hostOfficeId.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AIP form section — decides which of the three headings the program
              prints under in the export (GAS → STO → Operations), and is the
              code's fifth segment. */}
          <div className="space-y-1.5 md:space-y-2">
            <label htmlFor="papClass" className="text-xs md:text-sm font-medium text-neutral-900">
              Classification
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Controller<NewProgramFormValues, 'papClass'>
              name="papClass"
              control={control}
              render={({ field }) => (
                <SimpleSelect
                  id="papClass"
                  options={PAP_CLASSES.map(({ value, label }) => ({ value, label }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select classification…"
                  disabled={locked}
                  error={!!errors.papClass}
                />
              )}
            />
            {errors.papClass && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{errors.papClass.message}</span>
              </div>
            )}
          </div>

          {/* Program Name */}
          <div className="space-y-1.5 md:space-y-2">
            <label htmlFor="programName" className="text-xs md:text-sm font-medium text-neutral-900">
              Program Name
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Controller<NewProgramFormValues, 'programName'>
              name="programName"
              control={control}
              render={({ field }) => (
                <Input
                  id="programName"
                  placeholder="e.g. Socio-Economic Development Profiling &amp; Roadmap"
                  {...field}
                  onBlur={() => {
                    // Title-case on blur, not per keystroke — reformatting
                    // mid-word fights the caret. Acronyms are preserved.
                    // typeof guard: Controller's field.value is the union of all
                    // NewProgramFormValues field types, not just this one's.
                    if (typeof field.value === 'string') {
                      const formatted = titleCaseName(field.value)
                      if (formatted !== field.value) field.onChange(formatted)
                    }
                    field.onBlur()
                  }}
                  className={cn(
                    errors.programName && 'border-red-300 focus:ring-red-500'
                  )}
                />
              )}
            />
            {errors.programName && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{errors.programName.message}</span>
              </div>
            )}
          </div>

          {/* Implementation Period */}
          <ImplementationPeriodFields control={control} errors={errors} fiscalYear={fiscalYear} />

          {/* REVIEW OFFICE DETAILS divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200" />
            <span className="mx-3 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Review Office Details
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          {/* Single-select department picker — shown when the implementing office
              is the caller's to choose: no own org, or an office scope that spans
              more than one office. On the super-admin create path the multi-select
              below doubles as the picker (officeListIsImplementing). */}
          {canChooseOffice && (
            <div className="space-y-1.5 md:space-y-2">
              <label htmlFor="departmentId" className="text-xs md:text-sm font-medium text-neutral-900">
                Implementing Office
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <Controller<NewProgramFormValues, 'departmentId'>
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <OfficeCombobox
                    id="departmentId"
                    options={departments}
                    value={(field.value as string) || ''}
                    onChange={field.onChange}
                    placeholder={
                      departmentsLoading ? 'Loading offices…' : 'Select implementing office'
                    }
                    disabled={departmentsLoading}
                    error={!!errors.departmentId}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground/90">
                Offices you are scoped to. Search by acronym or name.
              </p>
              {errors.departmentId && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{errors.departmentId.message}</span>
                </div>
              )}
            </div>
          )}

          {/* Office Multi-Select */}
          <div className="space-y-1.5 md:space-y-2">
            <label className="text-xs md:text-sm font-medium text-neutral-900">
              {canChooseOffice ? 'Supporting Offices' : 'Implementing Office / Organization'}
              {!canChooseOffice && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <Controller<NewProgramFormValues, 'supportingOfficeIds'>
              name="supportingOfficeIds"
              control={control}
              render={({ field }) => (
                <OfficeMultiSelect
                  options={supportableOffices}
                  value={(field.value as string[]) ?? []}
                  onChange={field.onChange}
                  // With a dedicated implementing-office picker above, the list is
                  // purely supporting offices and starts empty.
                  lockedId={canChooseOffice ? undefined : primaryOfficeId}
                  lockedOption={canChooseOffice ? undefined : implementingOffice}
                  min={officeListIsImplementing ? 1 : 0}
                  max={officeListIsImplementing ? 5 : 4}
                  placeholder={
                    departmentsLoading
                      ? 'Loading offices…'
                      : officeListIsImplementing
                        ? 'Select implementing office(s)…'
                        : 'Add supporting offices…'
                  }
                  disabled={departmentsLoading}
                  error={!!errors.supportingOfficeIds || (officeListIsImplementing && !!errors.departmentId)}
                />
              )}
            />
            {(errors.supportingOfficeIds || (officeListIsImplementing && errors.departmentId)) && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {errors.supportingOfficeIds?.message
                    ?? (officeListIsImplementing
                      ? 'Select at least one implementing office.'
                      : errors.departmentId?.message)}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground/90 mt-1">
              {officeListIsImplementing
                ? 'Select at least 1 office. The first is the primary implementing office and sets the sector; add up to 4 more as supporting offices.'
                : canChooseOffice
                  ? 'Optional — add up to 4 offices supporting the implementing office above.'
                  : ownOrgId
                    ? 'Your office is auto-filled. Optionally add up to 4 supporting offices.'
                    : 'Optionally add up to 4 supporting offices.'}
            </p>
          </div>

          {/* Sector + AIP Code row */}
          <div className="grid gap-4 md:gap-6 md:grid-cols-2">
            {/* Sector */}
            <div className="space-y-1.5 md:space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="sectorId" className="text-xs md:text-sm font-medium text-neutral-900">
                  Sector
                </label>
                {sectorAutoAssigned && (
                  <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Auto-tagged
                  </span>
                )}
              </div>
              {sectorAutoAssigned ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-neutral-700">
                  {selectedSectorLabel
                    ? `${selectedSectorLabel.code} - ${selectedSectorLabel.name}`
                    : sectorsLoading
                      ? <span className="text-neutral-400">Loading…</span>
                      : <span className="text-neutral-400">Pending office selection</span>}
                </div>
              ) : (
                <Controller<NewProgramFormValues, 'sectorId'>
                  name="sectorId"
                  control={control}
                  render={({ field }) => (
                    <SimpleSelect
                      id="sectorId"
                      options={sectors.map((sector) => ({
                        value: sector.id,
                        label: `${sector.code} - ${sector.name}`,
                      }))}
                      value={(field.value as string) || ''}
                      onChange={field.onChange}
                      placeholder={
                        sectorsLoading
                          ? 'Loading sectors...'
                          : sectors.length === 0
                            ? 'No sectors available'
                            : 'Select a sector'
                      }
                      disabled={sectorsLoading || locked || sectors.length === 0}
                      error={!!errors.sectorId}
                    />
                  )}
                />
              )}
              {errors.sectorId && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{errors.sectorId.message}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground/90 mt-1">
                {locked
                  ? 'Sector is locked — cannot be changed after the program has been submitted.'
                  : officeHasNoSector
                  ? `${sectorSourceOffice!.code} has no PAP sector on file — choose the sector for this program. An admin can set the office default in Control Panel → Offices.`
                  : ownOrgId
                    ? 'Auto-assigned based on your implementing office.'
                    : officeListIsImplementing
                      ? 'Auto-assigned from the primary (first) implementing office.'
                      : 'Select the sector used for AIP classification.'}
              </p>
            </div>

            {/* AIP Reference Code */}
            <div className="space-y-1.5 md:space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs md:text-sm font-medium text-neutral-900">
                  AIP Reference Code
                </label>
                <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  Generated
                </span>
              </div>
              <AIPCodeDisplay
                code={aipCode}
                isLoading={isGeneratingCode}
                hasError={!!codeGenerationError}
                emptyText="Select Department and Sector to generate"
              />
              {codeGenerationError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{codeGenerationError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Drawer variant, "1. Program identity": name, classification, period, then
 * (at the end, per the drawer spec) the component-program checkbox. */
function DrawerIdentityFields({
  control,
  errors,
  fiscalYear,
  locked,
  isComponentProgram,
  hostableOffices,
}: {
  control: Control<NewProgramFormValues>;
  errors: FieldErrors<NewProgramFormValues>;
  fiscalYear?: number | null;
  locked?: boolean;
  isComponentProgram: boolean;
  hostableOffices: ReferenceOption[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="programName" className="text-sm font-medium text-slate-900">
          Program name
          <span className="ml-0.5 text-orange-700">*</span>
        </label>
        <Controller<NewProgramFormValues, 'programName'>
          name="programName"
          control={control}
          render={({ field }) => (
            <Input
              id="programName"
              placeholder="e.g. Socio-Economic Development Profiling & Roadmap"
              {...field}
              onBlur={() => {
                if (typeof field.value === 'string') {
                  const formatted = titleCaseName(field.value);
                  if (formatted !== field.value) field.onChange(formatted);
                }
                field.onBlur();
              }}
              className={cn(errors.programName && 'border-red-300 focus:ring-red-500')}
            />
          )}
        />
        {errors.programName && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{errors.programName.message}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-900">
          Classification
          <span className="ml-0.5 text-orange-700">*</span>
        </label>
        <Controller<NewProgramFormValues, 'papClass'>
          name="papClass"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PAP_CLASSES.map(({ value, label }) => {
                const selected = field.value === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={locked}
                    onClick={() => field.onChange(value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium leading-snug transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      locked && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.papClass && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{errors.papClass.message}</span>
          </div>
        )}
      </div>

      <ImplementationPeriodFields
        control={control}
        errors={errors}
        fiscalYear={fiscalYear}
        variant="drawer"
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3.5">
        <div className="flex items-start gap-3">
          <Controller<NewProgramFormValues, 'isComponentProgram'>
            name="isComponentProgram"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="isComponentProgramDrawer"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={locked}
                className="mt-0.5 h-4 w-4"
              />
            )}
          />
          <label htmlFor="isComponentProgramDrawer" className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-slate-900">
              This is a component program
            </span>
            <span className="text-xs text-slate-500">
              It appears under another office&rsquo;s AB sheet. Its AIP code still uses
              its own office.
            </span>
          </label>
        </div>

        {isComponentProgram && (
          <div className="flex flex-col gap-1.5 pl-7">
            <label htmlFor="hostOfficeIdDrawer" className="text-sm font-medium text-slate-900">
              Appears under
              <span className="ml-0.5 text-orange-700">*</span>
            </label>
            <Controller<NewProgramFormValues, 'hostOfficeId'>
              name="hostOfficeId"
              control={control}
              render={({ field }) => (
                <OfficeCombobox
                  id="hostOfficeIdDrawer"
                  options={hostableOffices}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select the host office…"
                  disabled={locked}
                  error={!!errors.hostOfficeId}
                />
              )}
            />
            {errors.hostOfficeId && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{errors.hostOfficeId.message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Drawer variant, "2. Implementing office": the picked-office list, then a
 * read-only sector + AIP code summary that updates live as the office
 * selection changes. */
function DrawerOfficeFields({
  control,
  departments,
  offices,
  supportableOffices,
  officeListIsImplementing,
  canChooseOffice,
  primaryOfficeId,
  implementingOffice,
  departmentsLoading,
  errors,
  sectors,
  selectedSectorLabel,
  sectorsLoading,
  sectorAutoAssigned,
  officeHasNoSector,
  sectorSourceOffice,
  aipCode,
  isGeneratingCode,
  codeGenerationError,
}: {
  control: Control<NewProgramFormValues>;
  departments: DepartmentOption[];
  offices: ReferenceOption[];
  supportableOffices: ReferenceOption[];
  officeListIsImplementing?: boolean;
  canChooseOffice: boolean;
  primaryOfficeId?: string;
  implementingOffice?: DepartmentOption;
  departmentsLoading: boolean;
  errors: FieldErrors<NewProgramFormValues>;
  sectors: ReferenceOption[];
  selectedSectorLabel?: ReferenceOption;
  sectorsLoading: boolean;
  sectorAutoAssigned: boolean;
  officeHasNoSector: boolean;
  sectorSourceOffice?: DepartmentOption;
  aipCode?: string;
  isGeneratingCode: boolean;
  codeGenerationError?: string;
}) {
  const officeError = !!errors.departmentId || !!errors.supportingOfficeIds;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-900">
          Offices
          <span className="ml-0.5 text-orange-700">*</span>
        </label>

        {officeListIsImplementing ? (
          <Controller<NewProgramFormValues, 'supportingOfficeIds'>
            name="supportingOfficeIds"
            control={control}
            render={({ field }) => {
              const ids = (field.value as string[]) ?? [];
              const picked: PickedOffice[] = ids.map((id, i) => {
                const o = offices.find((x) => x.id === id);
                return {
                  id,
                  code: o?.code ?? id,
                  name: o?.name ?? '',
                  role: i === 0 ? 'Primary' : 'Supporting',
                };
              });
              return (
                <OfficePickerList
                  picked={picked}
                  candidates={offices.filter((o) => !ids.includes(o.id))}
                  onAdd={(id) => field.onChange([...ids, id])}
                  onRemove={(id) => field.onChange(ids.filter((x) => x !== id))}
                  max={5}
                  disabled={departmentsLoading}
                  error={officeError}
                />
              );
            }}
          />
        ) : canChooseOffice ? (
          <Controller<NewProgramFormValues, 'departmentId'>
            name="departmentId"
            control={control}
            render={({ field: deptField }) => (
              <Controller<NewProgramFormValues, 'supportingOfficeIds'>
                name="supportingOfficeIds"
                control={control}
                render={({ field: suppField }) => {
                  const deptId = (deptField.value as string) || '';
                  const suppIds = (suppField.value as string[]) ?? [];
                  const primary = deptId ? departments.find((x) => x.id === deptId) : undefined;
                  const picked: PickedOffice[] = [
                    ...(deptId
                      ? [{
                          id: deptId,
                          code: primary?.code ?? deptId,
                          name: primary?.name ?? '',
                          role: 'Primary' as const,
                        }]
                      : []),
                    ...suppIds.map((id) => {
                      const o = offices.find((x) => x.id === id);
                      return { id, code: o?.code ?? id, name: o?.name ?? '', role: 'Supporting' as const };
                    }),
                  ];
                  const pickedIds = new Set(picked.map((p) => p.id));
                  const candidates = deptId
                    ? offices.filter((o) => !pickedIds.has(o.id))
                    : departments.filter((o) => !pickedIds.has(o.id));
                  return (
                    <OfficePickerList
                      picked={picked}
                      candidates={candidates}
                      onAdd={(id) => {
                        if (!deptId) deptField.onChange(id);
                        else suppField.onChange([...suppIds, id]);
                      }}
                      onRemove={(id) => {
                        if (id === deptId) {
                          const [next, ...rest] = suppIds;
                          deptField.onChange(next ?? '');
                          suppField.onChange(rest);
                        } else {
                          suppField.onChange(suppIds.filter((x) => x !== id));
                        }
                      }}
                      max={5}
                      disabled={departmentsLoading}
                      error={officeError}
                    />
                  );
                }}
              />
            )}
          />
        ) : (
          <Controller<NewProgramFormValues, 'supportingOfficeIds'>
            name="supportingOfficeIds"
            control={control}
            render={({ field }) => {
              const suppIds = (field.value as string[]) ?? [];
              const picked: PickedOffice[] = [
                ...(primaryOfficeId
                  ? [{
                      id: primaryOfficeId,
                      code: implementingOffice?.code ?? '',
                      name: implementingOffice?.name ?? '',
                      role: 'Primary' as const,
                      locked: true,
                    }]
                  : []),
                ...suppIds.map((id) => {
                  const o = offices.find((x) => x.id === id);
                  return { id, code: o?.code ?? id, name: o?.name ?? '', role: 'Supporting' as const };
                }),
              ];
              return (
                <OfficePickerList
                  picked={picked}
                  candidates={supportableOffices.filter((o) => !suppIds.includes(o.id))}
                  onAdd={(id) => field.onChange([...suppIds, id])}
                  onRemove={(id) => field.onChange(suppIds.filter((x) => x !== id))}
                  max={5}
                  disabled={departmentsLoading}
                  error={!!errors.supportingOfficeIds}
                />
              );
            }}
          />
        )}
        {(errors.departmentId || errors.supportingOfficeIds) && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {errors.supportingOfficeIds?.message ?? errors.departmentId?.message}
            </span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {officeListIsImplementing
            ? 'The first office is the primary office and sets the sector. Add up to 4 supporting offices.'
            : canChooseOffice
              ? 'The first office is primary and sets the sector. Add up to 4 supporting offices.'
              : 'Your office is the primary office. Add up to 4 supporting offices.'}
        </p>
      </div>

      <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Sector · set by primary office</span>
          {sectorAutoAssigned ? (
            <span
              className={cn(
                'text-sm font-medium',
                selectedSectorLabel ? 'text-slate-900' : 'text-slate-400',
              )}
            >
              {selectedSectorLabel
                ? `${selectedSectorLabel.code} - ${selectedSectorLabel.name}`
                : sectorsLoading
                  ? 'Loading…'
                  : 'Pending office selection'}
            </span>
          ) : (
            <Controller<NewProgramFormValues, 'sectorId'>
              name="sectorId"
              control={control}
              render={({ field }) => (
                <SimpleSelect
                  id="sectorId"
                  size="sm"
                  options={sectors.map((sector) => ({
                    value: sector.id,
                    label: `${sector.code} - ${sector.name}`,
                  }))}
                  value={(field.value as string) || ''}
                  onChange={field.onChange}
                  placeholder={sectorsLoading ? 'Loading sectors…' : 'Select a sector'}
                  disabled={sectorsLoading || sectors.length === 0}
                  error={!!errors.sectorId}
                />
              )}
            />
          )}
          {officeHasNoSector && sectorSourceOffice && (
            <span className="text-xs text-amber-700">
              {sectorSourceOffice.code} has no PAP sector on file — choose one manually.
            </span>
          )}
          {errors.sectorId && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.sectorId.message}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="w-fit cursor-help text-xs text-slate-500 underline decoration-dotted decoration-slate-300" />
              }
            >
              AIP reference code · generated
            </TooltipTrigger>
            <TooltipContent>{AIP_CODE_FORMAT_HINT}</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              'font-mono text-sm',
              aipCode ? 'text-slate-900' : 'text-slate-400',
            )}
          >
            {isGeneratingCode ? 'Generating…' : aipCode ?? 'Select office and sector to generate'}
          </span>
          {codeGenerationError && (
            <span className="text-xs text-destructive">{codeGenerationError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ImplementationPeriodFields({
  control,
  errors,
  fiscalYear,
  variant = 'card',
}: {
  control: Control<NewProgramFormValues>;
  errors: FieldErrors<NewProgramFormValues>;
  fiscalYear?: number | null;
  variant?: 'card' | 'drawer';
}) {
  const startError =
    errors.implementationStartMonth?.message ??
    errors.implementationStartYear?.message;
  const endError =
    errors.implementationEndMonth?.message ??
    errors.implementationEndYear?.message;

  if (variant === 'drawer') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-900">
          Implementation period
          <span className="ml-0.5 text-orange-700">*</span>
        </label>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <Controller<NewProgramFormValues, 'implementationStartMonth'>
            name="implementationStartMonth"
            control={control}
            render={({ field: monthField }) => (
              <Controller<NewProgramFormValues, 'implementationStartYear'>
                name="implementationStartYear"
                control={control}
                render={({ field: yearField }) => (
                  <MonthYearPicker
                    id="implementationStart"
                    value={monthYearFromFields(
                      monthField.value as number | undefined,
                      yearField.value as number | undefined,
                    )}
                    onChange={(v) => {
                      monthField.onChange(v.month);
                      yearField.onChange(v.year);
                    }}
                    error={!!startError}
                    placeholder="Start month & year"
                    minYear={fiscalYear ?? undefined}
                  />
                )}
              />
            )}
          />
          <span className="text-sm text-slate-400">to</span>
          <Controller<NewProgramFormValues, 'implementationEndMonth'>
            name="implementationEndMonth"
            control={control}
            render={({ field: monthField }) => (
              <Controller<NewProgramFormValues, 'implementationEndYear'>
                name="implementationEndYear"
                control={control}
                render={({ field: yearField }) => (
                  <MonthYearPicker
                    id="implementationEnd"
                    value={monthYearFromFields(
                      monthField.value as number | undefined,
                      yearField.value as number | undefined,
                    )}
                    onChange={(v) => {
                      monthField.onChange(v.month);
                      yearField.onChange(v.year);
                    }}
                    error={!!endError}
                    placeholder="End month & year"
                    minYear={fiscalYear ?? undefined}
                  />
                )}
              />
            )}
          />
        </div>
        {(startError || endError) && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{startError ?? endError}</span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Projects and activities under this program must fall within this period.
          {fiscalYear ? ` Earliest allowed is ${fiscalYear}.` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 md:space-y-2">
      <label className="text-xs md:text-sm font-medium text-neutral-900">
        Implementation Period
        <span className="text-destructive ml-0.5">*</span>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Start</span>
          <Controller<NewProgramFormValues, 'implementationStartMonth'>
            name="implementationStartMonth"
            control={control}
            render={({ field: monthField }) => (
              <Controller<NewProgramFormValues, 'implementationStartYear'>
                name="implementationStartYear"
                control={control}
                render={({ field: yearField }) => (
                  <MonthYearPicker
                    id="implementationStart"
                    value={monthYearFromFields(
                      monthField.value as number | undefined,
                      yearField.value as number | undefined,
                    )}
                    onChange={(v) => {
                      monthField.onChange(v.month);
                      yearField.onChange(v.year);
                    }}
                    error={!!startError}
                    placeholder="Select start month & year"
                    minYear={fiscalYear ?? undefined}
                  />
                )}
              />
            )}
          />
          {startError && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{startError}</span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">End</span>
          <Controller<NewProgramFormValues, 'implementationEndMonth'>
            name="implementationEndMonth"
            control={control}
            render={({ field: monthField }) => (
              <Controller<NewProgramFormValues, 'implementationEndYear'>
                name="implementationEndYear"
                control={control}
                render={({ field: yearField }) => (
                  <MonthYearPicker
                    id="implementationEnd"
                    value={monthYearFromFields(
                      monthField.value as number | undefined,
                      yearField.value as number | undefined,
                    )}
                    onChange={(v) => {
                      monthField.onChange(v.month);
                      yearField.onChange(v.year);
                    }}
                    error={!!endError}
                    placeholder="Select end month & year"
                    minYear={fiscalYear ?? undefined}
                  />
                )}
              />
            )}
          />
          {endError && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{endError}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground/90 mt-1">
        Child projects and activities must fall within this period.
        {fiscalYear ? ` Earliest allowed year is ${fiscalYear} (FY of this AIP cycle).` : ''}
      </p>
    </div>
  );
}
