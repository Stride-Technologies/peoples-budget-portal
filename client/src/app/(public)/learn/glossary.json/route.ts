import { GLOSSARY, SOURCE_LABEL, glossaryAnchor } from '@/lib/glossary';

export const dynamic = 'force-static';

/**
 * `/learn/glossary.json`: the glossary page as data, for other civic tools —
 * first the Sanggunian hearings transcripts (issue #100), which use the terms to
 * correct spelling in machine transcripts and link each term back here.
 * `url` is the term's anchor on `/learn/glossary`, so a consumer links to the
 * same definition a visitor reads. Built at build time from `lib/glossary.ts`.
 */
export function GET() {
  return Response.json(
    GLOSSARY.flatMap((group) =>
      group.entries.map((entry) => ({
        term: entry.term,
        short: entry.short ?? null,
        definition: entry.definition,
        group: group.heading,
        source: SOURCE_LABEL[entry.source],
        url: `/learn/glossary#${glossaryAnchor(entry.term)}`,
      })),
    ),
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  );
}
