import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtGuard } from './auth/guards/jwt.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { PrismaHealthIndicator } from './health/prisma.health.js';
import { RedisHealthIndicator } from './health/redis.health.js';
import { MailModule } from './mail/mail.module.js';
import { StorageModule } from './storage/storage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { CacheModule } from './cache/cache.module.js';
import { UsersModule } from './users/users.module.js';
import { ReferenceModule } from './reference/reference.module.js';
import { AIPCyclesModule } from './aip-cycles/aip-cycles.module.js';
import { BudgetCyclesModule } from './budget-cycles/budget-cycles.module.js';
import { BudgetDocumentsModule } from './budget-documents/budget-documents.module.js';
import { BudgetCeilingsModule } from './budget-ceilings/budget-ceilings.module.js';
import { AIPCodesModule } from './aip-codes/aip-codes.module.js';
import { BudgetRollupModule } from './budget-rollup/budget-rollup.module.js';
import { ProgramsModule } from './programs/programs.module.js';
import { ProjectActivitiesModule } from './project-activities/project-activities.module.js';
import { LineItemsModule } from './line-items/line-items.module.js';
import { ClimateTagsModule } from './climate-tags/climate-tags.module.js';
import { ThematicTagsModule } from './thematic-tags/thematic-tags.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { AIPRegistryModule } from './aip-registry/aip-registry.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AdminModule } from './admin/admin.module.js';
import { EventsModule } from './events/events.module.js';
import { PublicModule } from './public/public.module.js';
import { OpenDataModule } from './open-data/open-data.module.js';
import { ExplorerModule } from './explorer/explorer.module.js';
import { LguModule } from './lgu/lgu.module.js';
import { PpmpModule } from './ppmp/ppmp.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { ProgramAuditModule } from './program-audit/program-audit.module.js';
import { PermissionGuard } from './permissions/guards/permission.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TerminusModule,
    // Applied per route with ThrottlerGuard: public feedback (this default, 5 per
    // 10 min) and the public /auth routes (their own @Throttle).
    ThrottlerModule.forRoot({
      // The client container calls the API for every visitor; it forwards the
      // visitor's IP as X-Real-IP (nginx overwrites that header at the edge).
      // ponytail: header trusted — fine on DO, where the API is only reachable
      // through nginx; on Azure dev/staging the API ingress is public, so it
      // can be spoofed there.
      getTracker: (req: Record<string, unknown>) => {
        const r = req as {
          headers?: Record<string, string | undefined>;
          ip?: string;
        };
        return r.headers?.['x-real-ip'] ?? r.ip ?? '';
      },
      throttlers: [
        {
          ttl: 600_000,
          limit: 5,
          skipIf: () => process.env.NODE_ENV === 'development',
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    CacheModule,
    PermissionsModule,
    ProgramAuditModule,
    MailModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ReferenceModule,
    AIPCyclesModule,
    BudgetCyclesModule,
    BudgetDocumentsModule,
    BudgetCeilingsModule,
    AIPCodesModule,
    BudgetRollupModule,
    ProgramsModule,
    ProjectActivitiesModule,
    LineItemsModule,
    ClimateTagsModule,
    ThematicTagsModule,
    CommentsModule,
    AIPRegistryModule,
    DashboardModule,
    AdminModule,
    EventsModule,
    PublicModule,
    OpenDataModule,
    ExplorerModule,
    LguModule,
    PpmpModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaHealthIndicator,
    RedisHealthIndicator,
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // After JwtGuard so request.user is populated. RolesGuard stays alongside
    // during the migration; a route may carry both (§5.3).
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
