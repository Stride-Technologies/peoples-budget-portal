import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { documentMimetypeForExtension } from '../ppmp/document-signature.js';
import { resolveStorageProvider } from './storage-provider.js';

/**
 * Serves files written by `LocalFileStorageAdapter`, and answers 404 for
 * everything unless that adapter is the active one: with DO Spaces the
 * document URLs point at the bucket and nothing should read the API's disk.
 */
@Controller('ppmp/uploads')
export class StorageController {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'ppmp');
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = resolveStorageProvider(config) === 'local';
  }

  @Get(':filename')
  @Public()
  async serve(@Param('filename') filename: string, @Res() response: Response) {
    // Reject path traversal — filenames are always randomUUID()+extname(),
    // so anything containing a separator is not a real stored file.
    if (
      !this.enabled ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..')
    ) {
      throw new NotFoundException('File not found');
    }

    const filePath = join(this.uploadDir, filename);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('File not found');
    }

    // The type comes from the (upload-validated) extension; the browser must not guess.
    response.setHeader(
      'Content-Type',
      documentMimetypeForExtension(filename) ?? 'application/octet-stream',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(filePath).pipe(response);
  }
}
