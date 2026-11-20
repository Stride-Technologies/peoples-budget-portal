import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { rejectBrotliBody } from './common/reject-brotli.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const apiVersion = process.env.API_VERSION ?? 'v1';
  app.setGlobalPrefix(`api/${apiVersion}`);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Deny cross-origin browser calls, except the open-data API. The browser never
  // calls the rest of this API directly: the Next client calls it server-side
  // and proxies the rest same-origin (/api/events, the exports). Open data
  // (specs/007) is anonymous and read-only and meant to be fetched from other
  // sites, so it alone answers `*` — no credentials, so `*` is valid.
  const openDataPrefix = `/api/${apiVersion}/open-data/`;
  app.enableCors(
    (
      req: Request,
      callback: (err: Error | null, options: CorsOptions) => void,
    ) => {
      callback(
        null,
        req.url?.startsWith(openDataPrefix)
          ? { origin: '*', methods: ['GET', 'HEAD'] }
          : { origin: false },
      );
    },
  );

  // The API answers JSON and file downloads, never pages, so only the headers
  // that matter for that. No CSP beyond frame-ancestors: a CSP on a PDF
  // response can stop the browser's built-in viewer from opening it.
  // Ahead of Nest's body parsers, which register at listen(). See reject-brotli.ts.
  app.use(rejectBrotliBody);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    next();
  });

  // Swagger only on a laptop (NODE_ENV unset) and the Azure dev app and PR
  // previews (development). Staging runs NODE_ENV=staging on real data and
  // production runs production; both stay closed.
  const nodeEnv = process.env.NODE_ENV;
  if (!nodeEnv || nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle("People's Budget Portal API")
      .setDescription("REST API for the People's Budget Portal")
      .setVersion(apiVersion)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`api/${apiVersion}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  console.log(`API is running on http://localhost:${port}/api/${apiVersion}`);
}
void bootstrap();
