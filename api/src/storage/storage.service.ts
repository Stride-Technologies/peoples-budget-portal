import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_ADAPTER } from './storage-adapter.interface.js';
import type {
  StorageAdapter,
  StoredFile,
  StoredFileResult,
} from './storage-adapter.interface.js';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
  ) {}

  save(file: StoredFile): Promise<StoredFileResult> {
    return this.adapter.save(file);
  }
}
