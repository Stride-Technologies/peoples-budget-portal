import { Badge } from '@/components/ui/badge';
import type { ThematicTagRef } from '@/lib/api';

/**
 * Shared badge rendering for a program/PPA's beneficiary-category tags — used
 * identically on staff and public views (an inherited tag renders no
 * differently from a direct one here; only the staff editor distinguishes
 * them, via a lock icon and no remove control).
 */
export function ThematicTagBadges({ tags }: Readonly<{ tags: ThematicTagRef[] }>) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="text-xs font-medium">
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
