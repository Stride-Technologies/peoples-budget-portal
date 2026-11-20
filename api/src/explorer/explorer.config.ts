/**
 * The explorer's switches (specs/018 design §10). Read at call time, never
 * cached, so a flag flip needs no restart beyond the container's own env.
 */
const on = (name: string) => process.env[name] === '1';

/** Whole feature: off → every route 404s and the client hides the nav entry. */
export const explorerEnabled = () => on('EXPLORER_ENABLED');
/** Ask, model-written Explain and the mic. Off → cards, builder, templates only. */
export const explorerAiEnabled = () =>
  explorerEnabled() && on('EXPLORER_AI_ENABLED');
/**
 * Dev only (redesign W15): DRAFT and unpublished LEPs and ordinances join the
 * catalogue, each labelled "(draft)". Never set on staging or production.
 */
export const explorerIncludesDrafts = () => on('EXPLORER_INCLUDE_DRAFTS');
/** Store the question text (R15). Off in the open-source default. */
export const explorerLogsQuestions = () => on('EXPLORER_LOG_QUESTIONS');

const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
};

/** R19: the day's model spend cap in USD (UTC day). 0 = Ask always resting. */
export const explorerDailyBudgetUsd = () => num('EXPLORER_DAILY_BUDGET_USD', 5);
/** Which `prompts/ask.v<n>.md` the harness uses; part of every cache key. */
export const explorerPromptVersion = () =>
  process.env.EXPLORER_PROMPT_VERSION || '3';

/**
 * Model prices for the budget counter, USD per million tokens. Defaults are
 * deliberately high so a missing setting rests early rather than overspends.
 */
export const llmPricePerMTok = () => ({
  in: num('LLM_PRICE_IN_PER_MTOK', 3),
  out: num('LLM_PRICE_OUT_PER_MTOK', 15),
});
/**
 * specs/020 B4: the LGU's opt-in to keeping residents' opted-in questions for
 * training. Off until the city's privacy notice says so; the resident's own
 * opt-in (unticked by default) is the second key.
 */
export const explorerTrainingCapture = () =>
  explorerAiEnabled() && on('EXPLORER_TRAINING_CAPTURE');
