import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type {
  StorageAdapter,
  StoredFile,
  StoredFileResult,
} from '../storage-adapter.interface.js';

/**
 * Local-disk storage for development — the DO Spaces adapter's dev
 * counterpart, same role `ConsoleMailAdapter` plays for mail. Writes under
 * a gitignored `api/uploads/ppmp/` and is read back by
 * `StorageController`'s streaming route, which only this adapter's URLs
 * point at (the DO Spaces adapter returns a directly public bucket URL).
 */
@Injectable()
export class LocalFileStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(LocalFileStorageAdapter.name);
  private readonly uploadDir = join(process.cwd(), 'uploads', 'ppmp');

  constructor(private readonly config: ConfigService) {}

  async save(file: StoredFile): Promise<StoredFileResult> {
    await mkdir(this.uploadDir, { recursive: true });

    const key = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(this.uploadDir, key), file.buffer);
    this.logger.log(`Stored ${file.originalname} locally as ${key}`);

    const port = this.config.get<string>('PORT', '8000');
    const apiVersion = this.config.get<string>('API_VERSION', 'v1');
    return {
      url: `http://localhost:${port}/api/${apiVersion}/ppmp/uploads/${key}`,
      key,
    };
  }
}
