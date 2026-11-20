/**
 * The workbook (specs/018 redesign P3, `redesign-p3-workbook.md`): sheets,
 * each one query and one mark. This is the structural check only; the query
 * rules are `validateQuery`'s, which the API runs before storing a snapshot.
 *
 * ONE FILE, TWO COPIES. `api/src/explorer/workbook/workbook.ts` is the source
 * and `client/src/lib/explore/workbook.ts` is a byte-for-byte copy, checked by
 * `client/src/lib/explore/workbook.test.ts`. It imports nothing so it can be
 * copied: edit the API copy, then `cp` it over.
 */

export const MARKS = [
  'auto',
  'bar',
  'stacked',
  'line',
  'area',
  'scatter',
  'heatmap',
  'treemap',
  'kpi',
  'map',
  'words',
  'table',
] as const;
export type Mark = (typeof MARKS)[number];

/** The P2 `Query`, as plain data (the engine's types live in the API only). */
export interface WorkbookQuery {
  source: string;
  documents: { kind: string; years: number[] }[];
  dimensions: string[];
  measures: { field: string; agg: string }[];
  filters: (
    | { field: string; op: 'in' | 'notIn'; values: string[] }
    | { field: string; op: 'between'; min?: string; max?: string }
    | { field: string; op: 'contains'; text: string }
  )[];
  sort?: { by: string; dir: 'asc' | 'desc' };
  limit?: number;
  calcs?: { type: string; measure: number; along?: string }[];
}

export interface Sheet {
  id: string;
  name: string;
  query: WorkbookQuery;
  mark: Mark;
}

/** 1–4 of the workbook's sheets side by side, linked by selection (W21). */
export interface Dashboard {
  id: string;
  name: string;
  sheets: string[];
}

export interface Workbook {
  v: 2;
  name: string;
  sheets: Sheet[];
  active: number;
  /** Absent when there are none, so a workbook without any keeps its snapshot id. */
  dashboards?: Dashboard[];
  /** The dashboard on screen; absent = the active sheet is. */
  board?: string;
}

export const MAX_SHEETS = 20;
export const MAX_DASHBOARDS = 10;
export const MAX_TILES = 4;
export const MAX_NAME = 60;
export const MAX_BYTES = 64 * 1024;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const strs = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

/** A name is the only free text a workbook carries: short, plain, no markup. */
// eslint-disable-next-line no-control-regex
const UNPLAIN = /[<>\u0000-\u001f\u007f]/;
export const plainName = (x: unknown): x is string =>
  isStr(x) && x.trim().length > 0 && x.length <= MAX_NAME && !UNPLAIN.test(x);

function pickQuery(q: Obj): WorkbookQuery | null {
  const { source, documents, dimensions, measures, filters } = q;
  if (!isStr(source) || !strs(dimensions)) return null;
  if (!Array.isArray(documents) || !Array.isArray(measures)) return null;
  if (!Array.isArray(filters)) return null;
  const docs = documents.map((d) =>
    isObj(d) &&
    isStr(d.kind) &&
    Array.isArray(d.years) &&
    d.years.every(Number.isInteger)
      ? { kind: d.kind, years: d.years as number[] }
      : null,
  );
  const ms = measures.map((m) =>
    isObj(m) && isStr(m.field) && isStr(m.agg)
      ? { field: m.field, agg: m.agg }
      : null,
  );
  const fs = filters.map((f): WorkbookQuery['filters'][number] | null => {
    if (!isObj(f) || !isStr(f.field)) return null;
    if ((f.op === 'in' || f.op === 'notIn') && strs(f.values))
      return { field: f.field, op: f.op, values: f.values };
    if (f.op === 'contains' && isStr(f.text))
      return { field: f.field, op: 'contains', text: f.text };
    if (
      f.op === 'between' &&
      (f.min === undefined || isStr(f.min)) &&
      (f.max === undefined || isStr(f.max))
    )
      return {
        field: f.field,
        op: 'between',
        ...(f.min !== undefined ? { min: f.min } : {}),
        ...(f.max !== undefined ? { max: f.max } : {}),
      };
    return null;
  });
  if (docs.includes(null) || ms.includes(null) || fs.includes(null))
    return null;
  const out: WorkbookQuery = {
    source,
    documents: docs as WorkbookQuery['documents'],
    dimensions,
    measures: ms as WorkbookQuery['measures'],
    filters: fs as WorkbookQuery['filters'],
  };
  const { sort, limit, calcs } = q;
  if (sort !== undefined) {
    if (!isObj(sort) || !isStr(sort.by)) return null;
    if (sort.dir !== 'asc' && sort.dir !== 'desc') return null;
    out.sort = { by: sort.by, dir: sort.dir };
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit)) return null;
    out.limit = limit as number;
  }
  if (calcs !== undefined) {
    if (!Array.isArray(calcs)) return null;
    const cs = calcs.map((c) =>
      isObj(c) &&
      isStr(c.type) &&
      Number.isInteger(c.measure) &&
      (c.along === undefined || isStr(c.along))
        ? {
            type: c.type,
            measure: c.measure as number,
            ...(c.along !== undefined ? { along: c.along } : {}),
          }
        : null,
    );
    if (cs.includes(null)) return null;
    out.calcs = cs as NonNullable<WorkbookQuery['calcs']>;
  }
  return out;
}

/**
 * The workbook rebuilt from its named fields only (an unknown key is dropped,
 * never stored), or the reasons it is not one. The rebuilt object's key order
 * is fixed, so `JSON.stringify` of it is canonical: the snapshot id hashes it.
 */
export function checkWorkbook(
  x: unknown,
):
  | { workbook: Workbook; errors?: never }
  | { workbook?: never; errors: string[] } {
  if (!isObj(x)) return { errors: ['Not a workbook.'] };
  const errors: string[] = [];
  if (x.v !== 2) errors.push('v: must be 2.');
  if (!plainName(x.name))
    errors.push(`name: 1–${MAX_NAME} characters of plain text.`);
  const sheets = x.sheets;
  if (!Array.isArray(sheets) || sheets.length < 1 || sheets.length > MAX_SHEETS)
    return { errors: [...errors, `sheets: 1–${MAX_SHEETS} sheets.`] };
  const active = x.active;
  if (!Number.isInteger(active) || (active as number) < 0)
    errors.push('active: not a sheet.');
  else if ((active as number) >= sheets.length)
    errors.push('active: not a sheet.');
  const ids = new Set<string>();
  const out: Sheet[] = [];
  sheets.forEach((s: unknown, i) => {
    const p = `sheets[${i}]`;
    if (!isObj(s)) return void errors.push(`${p}: not a sheet.`);
    if (!isStr(s.id) || !/^[a-z0-9]{1,12}$/.test(s.id) || ids.has(s.id))
      errors.push(`${p}.id: 1–12 lowercase letters or digits, unique.`);
    else ids.add(s.id);
    if (!plainName(s.name))
      errors.push(`${p}.name: 1–${MAX_NAME} characters of plain text.`);
    if (!(MARKS as readonly unknown[]).includes(s.mark))
      errors.push(`${p}.mark: unknown mark.`);
    const query = isObj(s.query) ? pickQuery(s.query) : null;
    if (!query) errors.push(`${p}.query: not a query.`);
    else
      out.push({
        id: s.id as string,
        name: s.name as string,
        query,
        mark: s.mark as Mark,
      });
  });
  const boards: Dashboard[] = [];
  const dashboards = x.dashboards;
  if (dashboards !== undefined) {
    if (!Array.isArray(dashboards) || dashboards.length > MAX_DASHBOARDS)
      errors.push(`dashboards: at most ${MAX_DASHBOARDS}.`);
    else
      dashboards.forEach((d: unknown, i) => {
        const p = `dashboards[${i}]`;
        const bad = () => void errors.push(`${p}: not a dashboard.`);
        if (!isObj(d) || !isStr(d.id) || !/^[a-z0-9]{1,12}$/.test(d.id))
          return bad();
        if (boards.some((b) => b.id === d.id)) return bad();
        if (!plainName(d.name))
          return void errors.push(
            `${p}.name: 1–${MAX_NAME} characters of plain text.`,
          );
        const ss = d.sheets;
        if (
          !strs(ss) ||
          ss.length < 1 ||
          ss.length > MAX_TILES ||
          new Set(ss).size !== ss.length ||
          !ss.every((id) => ids.has(id))
        )
          return void errors.push(
            `${p}.sheets: 1–${MAX_TILES} of this workbook's sheets.`,
          );
        boards.push({ id: d.id, name: d.name, sheets: ss });
      });
  }
  const board = x.board;
  if (
    board !== undefined &&
    !(isStr(board) && boards.some((b) => b.id === board))
  )
    errors.push('board: not a dashboard.');
  if (errors.length) return { errors };
  const workbook: Workbook = {
    v: 2,
    name: x.name as string,
    sheets: out,
    active: active as number,
    ...(boards.length ? { dashboards: boards } : {}),
    ...(boards.length && board !== undefined ? { board: board as string } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(workbook)).length > MAX_BYTES)
    return { errors: [`The workbook is over ${MAX_BYTES / 1024} KB.`] };
  return { workbook };
}
