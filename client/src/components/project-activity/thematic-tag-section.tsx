'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ThematicTagPicker } from '@/components/custom/thematic-tag-picker';
import type { ThematicTagRecord, ThematicTagRef } from '@/lib/api';
import { createThematicTagAction } from '@/app/programs/[id]/_actions';
import {
  loadPAThematicTagsAction,
  applyPAThematicTagAction,
  removePAThematicTagAction,
} from '@/components/project-activity/_actions';

interface ThematicTagSectionProps {
  projectActivityId: string;
  disabled?: boolean;
}

/**
 * A PPA's thematic tags: its own direct applications (removable here) plus
 * whatever its parent Program currently carries (shown, but locked — FR-009,
 * User Story 2). Loads independently of the edit form, same pattern as
 * `ProgramClimateTagCard`.
 */
export function ThematicTagSection({
  projectActivityId,
  disabled,
}: Readonly<ThematicTagSectionProps>) {
  const [tags, setTags] = useState<ThematicTagRef[]>([]);
  const [inherited, setInherited] = useState<ThematicTagRef[]>([]);
  const [catalog, setCatalog] = useState<ThematicTagRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPAThematicTagsAction(projectActivityId).then((res) => {
      setLoading(false);
      if ('error' in res) return setMessage(res.error);
      setTags(res.tags);
      setInherited(res.inheritedTags);
      setCatalog(res.catalog);
    });
  }, [projectActivityId]);

  async function applyTag(tag: ThematicTagRef) {
    setMessage(null);
    const res = await applyPAThematicTagAction(projectActivityId, tag.id);
    if ('error' in res) return setMessage(res.error);
    setTags(res.tags);
    setCatalog((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, { ...tag, isActive: true }]));
  }

  async function removeTag(tagId: string) {
    setMessage(null);
    setRemovingId(tagId);
    const res = await removePAThematicTagAction(projectActivityId, tagId);
    setRemovingId(null);
    if ('error' in res) return setMessage(res.error);
    setTags(res.tags);
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-3">
        <h3 className="text-base font-semibold text-slate-950">Thematic tags</h3>
        <p className="mt-1 text-xs text-slate-600">
          Beneficiary groups this Project/Activity serves. Tags shown with a lock come from the
          parent program — remove those there, not here.
        </p>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {inherited.map((tag) => (
            <Badge
              key={`inherited-${tag.id}`}
              variant="outline"
              className="gap-1.5 py-1 pl-2.5 pr-2 text-xs font-medium text-muted-foreground"
            >
              {tag.name}
              <Lock className="size-3" />
            </Badge>
          ))}
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
            excludeIds={[...tags, ...inherited].map((t) => t.id)}
            disabled={disabled}
            onSelectExisting={applyTag}
            onCreate={createThematicTagAction}
          />
        </div>
        {disabled && (
          <p className="text-xs text-muted-foreground">
            Tags can only be changed while the parent program is in an editable state.
          </p>
        )}
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
    </section>
  );
}
