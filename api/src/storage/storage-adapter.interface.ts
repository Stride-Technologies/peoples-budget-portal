export interface StoredFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface StoredFileResult {
  url: string;
  key: string;
}

export interface StorageAdapter {
  save(file: StoredFile): Promise<StoredFileResult>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
