import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible object storage client (ADR-003). Points at local MinIO in
 * development and at R2 (or any S3-compatible provider) in production —
 * purely a config difference, same client code either way.
 */
export function createStorageClient(): S3Client {
  const endpoint = requireEnv("STORAGE_ENDPOINT");
  const region = process.env.STORAGE_REGION ?? "auto";
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY ?? "";
  const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === "true";

  const config: S3ClientConfig = {
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    // AWS SDK v3 auto-attaches x-amz-checksum-* params to every PutObject by
    // default (including presigned URLs) — R2 doesn't handle that checksum
    // flavor on presigned PUTs and responds 403. Restrict checksum
    // calculation to only when explicitly requested.
    requestChecksumCalculation: "WHEN_REQUIRED",
  };

  return new S3Client(config);
}

export function getStorageBucket(): string {
  return requireEnv("STORAGE_BUCKET");
}

/**
 * Presigned PUT URL for direct-to-storage uploads from the client
 * (ADR-003) — the Next.js API only ever hands out this URL, the file
 * bytes never pass through the web tier.
 */
export async function createPresignedUploadUrl(
  client: S3Client,
  key: string,
  options: { contentType?: string; expiresInSeconds?: number } = {},
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getStorageBucket(),
    Key: key,
    ContentType: options.contentType,
  });
  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? 900,
  });
}

/** Direct (non-presigned) upload, used by the worker/test scripts server-side. */
export async function putObjectBuffer(
  client: S3Client,
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: getStorageBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Fetches a full object as a Buffer. Raw .evtc files are small (a few MB),
 * unlike the EI JSON responses (ADR-008), so buffering them is fine. */
export async function getObjectBuffer(client: S3Client, key: string): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({ Bucket: getStorageBucket(), Key: key }),
  );
  const body = response.Body;
  if (!body) {
    throw new Error(`Object "${key}" has no body`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Deletes objects in batches of up to 1000 keys (the S3 DeleteObjects
 * limit). Used when removing a Project/UploadBatch so raw .evtc files
 * don't outlive the DB rows that reference them.
 */
export async function deleteObjects(client: S3Client, keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const bucket = getStorageBucket();
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((key) => ({ Key: key })) },
      }),
    );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
