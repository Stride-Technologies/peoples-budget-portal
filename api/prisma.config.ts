import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // Migrations need it; `prisma generate` (run on every install) does not, so a fresh clone installs without one.
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'ts-node --transpile-only --project tsconfig.seed.json prisma/seed.ts',
  },
});
