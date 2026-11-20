import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type {
  StorageAdapter,
  StoredFile,
  StoredFileResult,
} from '../storage-adapter.interface.js';

export interface S3ClientLike {
  send(command: PutObjectCommand): Promise<unknown>;
}

/**
 * The S3 client must talk to the *regional* endpoint: the SDK adds the bucket
 * to the hostname itself, so handing it the bucket's own origin (what the DO
 * console shows, `https://<bucket>.<region>.digitaloceanspaces.com`) makes it
 * call `<bucket>.<bucket>.<region>…`, which fails TLS. Either form is accepted
 * in `DO_SPACES_ENDPOINT`; this strips a leading `<bucket>.` and returns both
 * the client endpoint and the public origin objects are read from.
 */
export function spacesEndpoints(
  endpoint: string,
  bucket: string,
): { clientEndpoint: string; publicOrigin: string } {
  const url = new URL(endpoint);
  const regional = url.hostname.startsWith(`${bucket}.`)
    ? url.hostname.slice(bucket.length + 1)
    : url.hostname;
  return {
    clientEndpoint: `${url.protocol}//${regional}`,
    publicOrigin: `${url.protocol}//${bucket}.${regional}`,
  };
}

/**
 * DO Spaces (S3-compatible) storage for staging/production. Objects are
 * public-read; the URL is `<publicOrigin>/<key>`.
 */
@Injectable()
export class DOSpacesStorageAdapter implements StorageAdapter {
  private readonly client: S3ClientLike;
  private readonly publicOrigin: string;
  private readonly bucket: string;

  constructor(config: ConfigService, client?: S3ClientLike) {
    const endpoint = config.getOrThrow<string>('DO_SPACES_ENDPOINT');
    this.bucket = config.getOrThrow<string>('DO_SPACES_BUCKET');
    const { clientEndpoint, publicOrigin } = spacesEndpoints(
      endpoint,
      this.bucket,
    );
    this.publicOrigin = publicOrigin;

    if (client) {
      this.client = client;
      return;
    }

    this.client = new S3Client({
      endpoint: clientEndpoint,
      region: config.getOrThrow<string>('DO_SPACES_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('DO_SPACES_KEY'),
        secretAccessKey: config.getOrThrow<string>('DO_SPACES_SECRET'),
      },
    });
  }

  async save(file: StoredFile): Promise<StoredFileResult> {
    const key = `ppmp/${randomUUID()}${extname(file.originalname)}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    return { url: `${this.publicOrigin}/${key}`, key };
  }
}
