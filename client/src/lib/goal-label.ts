/**
 * What this LGU calls its top-level development goals: the heading every program is filed
 * under (Naga calls them "Finish Lines"; elsewhere they are the priority areas of the
 * Executive-Legislative Agenda). The database and the API still say `finishLine`.
 *
 * Build-time (`NEXT_PUBLIC_*`), so server code, client code and server actions read the same
 * words from a plain import. Set both the singular and the plural.
 */
export const GOAL = process.env.NEXT_PUBLIC_GOAL_NAME?.trim() || 'Development Priority';
export const GOALS = process.env.NEXT_PUBLIC_GOALS_NAME?.trim() || 'Development Priorities';
/** Mid-sentence forms: "filed under one development priority". */
export const goal = GOAL.toLowerCase();
export const goals = GOALS.toLowerCase();

/** The `{Goal}`, `{Goals}`, `{goal}` and `{goals}` slots every message can use. */
export const GOAL_VARS = { Goal: GOAL, Goals: GOALS, goal, goals } as const;
