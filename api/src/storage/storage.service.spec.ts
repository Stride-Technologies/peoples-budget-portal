import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { LocalFileStorageAdapter } from './adapters/local-file-storage.adapter.js';
import {
  DOSpacesStorageAdapter,
  spacesEndpoints,
  type S3ClientLike,
} from './adapters/do-spaces-storage.adapter.js';
import { StorageService } from './storage.service.js';
import type { ConfigService } from '@nestjs/config';

const configStub = (values: Record<string, string>) =>
  ({
    get: <T = string>(key: string, fallback?: T) =>
      (values[key] as T | undefined) ?? fallback,
    getOrThrow: <T = string>(key: string) => {
      if (values[key] === undefined) {
        throw new Error(`Missing config: ${key}`);
      }
      return values[key] as T;
    },
  }) as unknown as ConfigService;

describe('LocalFileStorageAdapter', () => {
  const uploadDir = join(process.cwd(), 'uploads', 'ppmp');

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('writes the file to disk and returns a fetchable local URL', async () => {
    const adapter = new LocalFileStorageAdapter(
      configStub({ PORT: '8000', API_VERSION: 'v1' }),
    );

    const result = await adapter.save({
      buffer: Buffer.from('hello world'),
      mimetype: 'text/plain',
      originalname: 'note.txt',
    });

    expect(result.url).toBe(
      `http://localhost:8000/api/v1/ppmp/uploads/${result.key}`,
    );
    expect(result.key.endsWith('.txt')).toBe(true);

    const written = await readFile(join(uploadDir, result.key), 'utf-8');
    expect(written).toBe('hello world');
  });

  it('goes through StorageService the same way any adapter would', async () => {
    const adapter = new LocalFileStorageAdapter(
      configStub({ PORT: '8000', API_VERSION: 'v1' }),
    );
    const service = new StorageService(adapter);

    const result = await service.save({
      buffer: Buffer.from('via service'),
      mimetype: 'text/plain',
      originalname: 'via-service.txt',
    });

    const written = await readFile(join(uploadDir, result.key), 'utf-8');
    expect(written).toBe('via service');
  });
});

describe('DOSpacesStorageAdapter', () => {
  it('PUTs to the configured bucket with public-read ACL and returns endpoint/key', async () => {
    const send = jest.fn().mockResolvedValue({});
    const client: S3ClientLike = { send };

    const adapter = new DOSpacesStorageAdapter(
      configStub({
        DO_SPACES_ENDPOINT:
          'https://naga-city-budget-tracker.sgp1.digitaloceanspaces.com',
        DO_SPACES_BUCKET: 'naga-city-budget-tracker',
        DO_SPACES_REGION: 'sgp1',
        DO_SPACES_KEY: 'key',
        DO_SPACES_SECRET: 'secret',
      }),
      client,
    );

    const result = await adapter.save({
      buffer: Buffer.from('pdf-bytes'),
      mimetype: 'application/pdf',
      originalname: 'estimate.pdf',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('naga-city-budget-tracker');
    expect(command.input.ContentType).toBe('application/pdf');
    expect(command.input.ACL).toBe('public-read');
    expect(String(command.input.Key)).toMatch(/^ppmp\/.+\.pdf$/);
    expect(result.url).toBe(
      `https://naga-city-budget-tracker.sgp1.digitaloceanspaces.com/${result.key}`,
    );
  });

  it('gives the SDK the regional endpoint, whichever form is configured', () => {
    const bucketOrigin = spacesEndpoints(
      'https://naga-city-budget-tracker.sgp1.digitaloceanspaces.com',
      'naga-city-budget-tracker',
    );
    const regional = spacesEndpoints(
      'https://sgp1.digitaloceanspaces.com',
      'naga-city-budget-tracker',
    );
    for (const e of [bucketOrigin, regional]) {
      expect(e.clientEndpoint).toBe('https://sgp1.digitaloceanspaces.com');
      expect(e.publicOrigin).toBe(
        'https://naga-city-budget-tracker.sgp1.digitaloceanspaces.com',
      );
    }
  });

  it('throws clearly when required config is missing', () => {
    expect(
      () => new DOSpacesStorageAdapter(configStub({}), { send: jest.fn() }),
    ).toThrow('Missing config: DO_SPACES_ENDPOINT');
  });
});
