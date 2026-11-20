import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { inferenceFromEnv } from './adapters/sidecar.js';
import { TYPED_DECISION_PORT } from './ports/inference.port.js';

const INFERENCE = Symbol('INFERENCE');
type Inference = ReturnType<typeof inferenceFromEnv>;
import { sttFromEnv } from './adapters/stt.js';
import { AskService } from './ask.service.js';
import { ChatService } from './chat/chat.service.js';
import { CatalogueService } from './catalogue.service.js';
import { ExplorerLimits } from './explorer-limits.js';
import { explorerPromptVersion } from './explorer.config.js';
import { ExplorerLogController } from './explorer-log.controller.js';
import { ExplorerController } from './explorer.controller.js';
import { ExplorerLogService } from './log.service.js';
import { DECISION_PORT, LlmDecision } from './ports/decision.port.js';
import { LLM_PORT, type LlmPort } from './ports/llm.port.js';
import { EMBED_PORT, type EmbedPort } from './ports/embed.port.js';
import { STT_PORT } from './ports/stt.port.js';
import { ResolveService } from './resolve.service.js';
import { SnapshotService } from './workbook/snapshot.service.js';
import { QueryService } from './query/query.service.js';
import { ViewService } from './view.service.js';
import { ExplorerTrainingService } from './training.service.js';

// CacheModule is @Global, so CacheService needs no import here.
@Module({
  imports: [PrismaModule],
  controllers: [ExplorerController, ExplorerLogController],
  providers: [
    CatalogueService,
    ViewService,
    ExplorerLimits,
    ExplorerLogService,
    AskService,
    ChatService,
    ResolveService,
    QueryService,
    SnapshotService,
    ExplorerTrainingService,
    // specs/020 B3.1: one port, three backends (EXPLORER_INFERENCE*); a bad setting fails at boot.
    { provide: INFERENCE, useFactory: () => inferenceFromEnv() },
    {
      provide: LLM_PORT,
      useFactory: (i: Inference) => i.llm,
      inject: [INFERENCE],
    },
    // `null` without EMBED_MODEL: words match catalogue values by alias only.
    {
      provide: EMBED_PORT,
      useFactory: (i: Inference) => i.embedder,
      inject: [INFERENCE],
    },
    // `null` unless EXPLORER_INFERENCE(_DECIDE) names the sidecar or the Stride API.
    {
      provide: TYPED_DECISION_PORT,
      useFactory: (i: Inference) => i.decider,
      inject: [INFERENCE],
    },
    // `null` when STT_PROVIDER is unset: no mic, and /transcribe 404s.
    { provide: STT_PORT, useFactory: () => sttFromEnv() },
    // DECISION_PROVIDER=jev|laya plug in here (specs/018 P6); llm is the default.
    {
      provide: DECISION_PORT,
      useFactory: (llm: LlmPort, embedder: EmbedPort | null) =>
        new LlmDecision(llm, explorerPromptVersion, embedder),
      inject: [LLM_PORT, EMBED_PORT],
    },
  ],
  exports: [CatalogueService, ViewService],
})
export class ExplorerModule {}
