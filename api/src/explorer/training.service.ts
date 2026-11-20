import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { explorerTrainingCapture } from './explorer.config.js';
import {
  TYPED_DECISION_PORT,
  type TypedDecisionPort,
} from './ports/inference.port.js';

/** At or above this P("names a private person") the question is dropped. Deliberately low. */
export const PERSON_DROP_AT = 0.2;
export const TRAINING_RETENTION_MONTHS = 12;
/** At most this many scrubs in flight; beyond it a question is dropped, not queued. */
export const MAX_IN_FLIGHT = 4;

/**
 * What a regex can see (specs/020 B4.2): emails, Philippine mobile and
 * landline numbers, long digit runs (IDs, account numbers), @handles and
 * Facebook links, a person's title or Filipino person marker followed by a
 * name ("Kap. Santos", "kay Aling Rosa", "si Juan"), and a street address
 * (Purok, Zone, Blk, Lot + number). Case-insensitive. A hit drops the
 * question: nothing is stored redacted.
 */
export function regexFlags(text: string): string[] {
  const NAME = "[A-ZÑ][a-zñ'-]+";
  const rules: [string, RegExp][] = [
    ['email', /[\w.+-]+@[\w-]+(\.[\w-]+)+/i],
    ['phone', /(\+?63|\b0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/],
    ['landline', /\b\d{3}[\s-]\d{4}\b/],
    ['digits', /\b\d(?:[\s-]?\d){7,}\b/],
    ['handle', /(^|\s)@\w{2,}|\b(?:fb|facebook|m\.me)\.com\/|\bm\.me\//i],
    [
      'titled-name',
      new RegExp(
        `\\b(?:Mr|Mrs|Ms|Mx|Dr|Atty|Engr|Hon|Kap|Kapitan|Kagawad|Konsehal|Sir|Ma'?am|Gng|Bb|G|Aling|Mang|Ate|Kuya|Manay|Manoy|Tiya|Tiyo|Lola|Lolo)\\.?\\s+${NAME}`,
        'i',
      ),
    ],
    // "si Juan", "kay Rosa", "nina Pedro" — Filipino markers for a person's name.
    ['person-marker', new RegExp(`\\b(?:si|ni|kay|sina|nina|kina)\\s+${NAME}`)],
    ['address', /\b(?:purok|zone|blk|block|lot)\s*\.?\s*\d/i],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([id]) => id);
}

const PERSON_QUESTION = {
  person: {
    type: 'noul' as const,
    instructions:
      "Does this question name, or describe so they could be identified, a specific private individual — a resident, an employee, a beneficiary, a contractor's owner, a family member? Public offices, office titles without a name, barangays, programs, projects, places and the city itself do not count.",
  },
};

export interface ScrubVerdict {
  keep: boolean;
  regex: string[];
  /** P(names a private person) from the decision model; null when it was not asked. */
  personP: number | null;
  model: string | null;
  reason?: string;
}

/**
 * Opted-in question capture (specs/020 B4). Two keys must both be turned:
 * the LGU's `EXPLORER_TRAINING_CAPTURE=1` and the resident's own consent on
 * this question. Then the scrubber runs and fails closed: a regex hit, a
 * person probability at or above `PERSON_DROP_AT`, no decision model, or any
 * error, and the question is not stored. Never blocks or changes an answer.
 */
@Injectable()
export class ExplorerTrainingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExplorerTrainingService.name);
  private timer?: NodeJS.Timeout;
  private inFlight = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(TYPED_DECISION_PORT)
    private readonly decider: TypedDecisionPort | null = null,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // ponytail: the same in-process daily timer as the question log's retention.
    const run = () =>
      void this.retention().catch((e: Error) =>
        this.logger.warn(`Training retention failed: ${e.message}`),
      );
    this.timer = setInterval(run, 86_400_000);
    this.timer.unref();
    setTimeout(run, 90_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scrub(text: string): Promise<ScrubVerdict> {
    const regex = regexFlags(text);
    if (regex.length)
      return {
        keep: false,
        regex,
        personP: null,
        model: null,
        reason: 'regex',
      };
    if (!this.decider)
      return {
        keep: false,
        regex,
        personP: null,
        model: null,
        reason: 'no decision model (fail closed)',
      };
    // The person check sends the raw question to the decide backend: on the
    // deployment's own sidecar by default. Stride's hosted API only with its
    // own switch, because questions dropped here would still have reached it.
    if (
      (process.env.EXPLORER_INFERENCE_DECIDE ||
        process.env.EXPLORER_INFERENCE) === 'stride' &&
      process.env.EXPLORER_TRAINING_SCRUB_REMOTE !== '1'
    )
      return {
        keep: false,
        regex,
        personP: null,
        model: null,
        reason: 'remote scrub not allowed (EXPLORER_TRAINING_SCRUB_REMOTE)',
      };
    const d = await this.decider.decide({ question: text }, PERSON_QUESTION);
    const p = d.answers.person?.p;
    if (typeof p !== 'number')
      return {
        keep: false,
        regex,
        personP: null,
        model: d.model,
        reason: 'no answer',
      };
    return {
      keep: p < PERSON_DROP_AT,
      regex,
      personP: p,
      model: d.model,
      ...(p >= PERSON_DROP_AT ? { reason: 'person' } : {}),
    };
  }

  /** Fire-and-forget from the answer path; the outcome is logged as counts only. */
  async capture(q: {
    consent?: boolean;
    text: string;
    lang: string;
    kind: 'ask' | 'chat';
    spec: unknown;
  }): Promise<'stored' | 'off' | 'no-consent' | 'dropped'> {
    // The LGU's key: the switch, and the privacy notice version it points to.
    const notice = process.env.EXPLORER_PRIVACY_NOTICE_VERSION;
    if (!explorerTrainingCapture() || !notice) return 'off';
    if (q.consent !== true) return 'no-consent';
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.logger.log('Training question dropped: scrubber busy');
      return 'dropped';
    }
    this.inFlight++;
    try {
      const verdict = await this.scrub(q.text);
      if (!verdict.keep) {
        this.logger.log(`Training question dropped: ${verdict.reason}`);
        return 'dropped';
      }
      await this.prisma.explorerTrainingQuestion.create({
        data: {
          text: q.text,
          lang: q.lang,
          kind: q.kind,
          spec: q.spec ?? undefined,
          verdict: {
            regex: verdict.regex,
            personP: verdict.personP,
            model: verdict.model,
            // The notice the resident agreed under (specs/020 B4).
            notice,
          },
          consentAt: new Date(),
        },
      });
      return 'stored';
    } catch (e) {
      // The name only: an endpoint's error body can echo the question.
      this.logger.warn(`Training capture failed: ${(e as Error).name}`);
      return 'dropped';
    } finally {
      this.inFlight--;
    }
  }

  /** Rows past retention are deleted, not nulled: the text is the whole row. */
  async retention(now = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - TRAINING_RETENTION_MONTHS);
    const { count } = await this.prisma.explorerTrainingQuestion.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}
