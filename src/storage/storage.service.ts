import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageConfig } from '../config/configuration';
import { randomToken, sha256 } from '../common/crypto/crypto.util';

export interface StoredObject {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
}

/**
 * S3-compatible object storage. All objects are written to a PRIVATE bucket
 * with server-side encryption; nothing is ever public. Access for internal
 * review happens through short-lived pre-signed GET URLs only.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cfg: StorageConfig;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.cfg = config.get<StorageConfig>('storage')!;
    this.client = new S3Client({
      region: this.cfg.region,
      endpoint: this.cfg.endpoint,
      forcePathStyle: this.cfg.forcePathStyle,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
      // Bound hung connections so a slow S3 doesn't pin request handlers.
      requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
      maxAttempts: 3,
    });
  }

  /**
   * Uploads bytes under a randomized, non-guessable key. The key never
   * incorporates user input, preventing path traversal / enumeration.
   */
  async upload(
    prefix: string,
    buffer: Buffer,
    mime: string,
    ext: string,
  ): Promise<StoredObject> {
    const storageKey = `${prefix}/${randomToken(16)}.${ext}`;
    const checksum = sha256(buffer);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mime,
        // Encrypt at rest.
        ServerSideEncryption: this.cfg
          .serverSideEncryption as ServerSideEncryption,
        SSEKMSKeyId:
          this.cfg.serverSideEncryption === 'aws:kms'
            ? this.cfg.kmsKeyId
            : undefined,
        // Integrity metadata.
        Metadata: { checksum },
      }),
    );

    return { storageKey, checksum, sizeBytes: buffer.length };
  }

  /**
   * Short-lived pre-signed URL for internal download. Forces an attachment
   * download with a neutral content type so documents never render inline in a
   * reviewer's authenticated browser session (defuses active-content PDFs, etc).
   */
  async getSignedDownloadUrl(
    storageKey: string,
    originalName: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    // ASCII-safe filename for the header; the real name is display-only.
    const safeName = originalName.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: storageKey,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: storageKey }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to delete object ${storageKey}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
