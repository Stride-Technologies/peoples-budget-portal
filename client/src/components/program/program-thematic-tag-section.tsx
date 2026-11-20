'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ThematicTagPicker } from '@/components/custom/thematic-tag-picker';
import type { ThematicTagRef } from '@/lib/api';
import {
  loadThematicTagCatalogAction,
  createThematicTagAction,
  applyProgramThematicTagAction,
  removeProgramThematicTagAction,
} from '@/app/programs/[id]/_actions';

interface ProgramThematicTagSectionProps {
  programId: string;
  tags: ThematicTagRef[];
  /** Only while the program is editable (DRAFT, FOR_REVISION, PUBLISHED_REVISION). */
  disabled?: boolean;
}

/**
 * Beneficiary-category tags on the program itself (PWD, Senior Citizens,
 * Youth, Women, Children, LGBTQIA+, or anything created since). PPAs inherit
 * these automatically — see `ThematicTagSection` for the PPA side.
 */
export function ProgramThematicTagSection({
  programId,
  tags: initialTags,
  disabled,
}: Readonly<ProgramThematicTagSectionProps>) {
  const [tags, setTags] = useState<ThematicTagRef[]>(initialTags);
  const [catalog, setCatalog] = useState<ThematicTagRef[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadThematicTagCatalogAction().then((res) => {
      if ('catalog' in res) setCatalog(res.catalog);
    });
  }, []);

  async function applyTag(tag: ThematicTagRef) {
    setMessage(null);
    const res = await applyProgramThematicTagAction(programId, tag.id);
    if ('error' in res) return setMessage(res.error);
    setTags(res.tags);
    setCatalog((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
  }

  async function removeTag(tagId: string) {
    setMessage(null);
    setRemovingId(tagId);
    const res = await removeProgramThematicTagAction(programId, tagId);
    setRemovingId(null);
    if ('error' in res) return setMessage(res.error);
    setTags(res.tags);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-3">
        <h3 className="text-base font-semibold text-slate-950">Thematic tags</h3>
        <p className="mt-1 text-xs text-slate-600">
          Beneficiary groups this program serves. Every Project/Activity under it shows these
          automatically, in addition to any tags applied to it directly.
        </p>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1.5 py-1 pl-2.5 pr-1 text-xs font-medium"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                disabled={disabled || removingId === tag.id}
                className="rounded-sm p-0.5 opacity-60 hover:opacity-100 disabled:opacity-30"
                aria-label={`Remove ${tag.name}`}
              >
                {removingId === tag.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
              </button>
            </Badge>
          ))}
          <ThematicTagPicker
            catalog={catalog}
            excludeIds={tags.map((t) => t.id)}
            disabled={disabled}
            onSelectExisting={applyTag}
            onCreate={createThematicTagAction}
          />
        </div>
        {disabled && (
          <p className="text-xs text-muted-foreground">
            Tags can only be changed while the program is in an editable state.
          </p>
        )}
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
    </section>
  );
}
