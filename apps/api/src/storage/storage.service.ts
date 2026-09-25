import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOAD_URL_TTL_S = 15 * 60;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

// S3-mos saqlash (Cloudflare R2, MinIO, AWS S3). Fayllar brauzerdan to'g'ridan-to'g'ri presigned URL orqali
// yuklanadi; Instagram ularni S3_PUBLIC_URL orqali yuklab oladi, shuning uchun bucket ochiq o'qiladigan bo'lishi kerak.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly publicBase = (process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
  private readonly client: S3Client | null;

  constructor() {
    const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
    this.client =
      S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && this.bucket && this.publicBase
        ? new S3Client({
            endpoint: S3_ENDPOINT,
            region: S3_REGION || 'auto',
            credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
            forcePathStyle: true,
            // Aks holda SDK presigned URL'ga CRC32 checksum qo'shadi va brauzerdan PUT R2/MinIO'da rad etiladi
            requestChecksumCalculation: 'WHEN_REQUIRED',
          })
        : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /** Yangi fayl uchun kalit va brauzer PUT qiladigan vaqtinchalik URL */
  async createUpload(schoolId: string, contentType: string): Promise<{ key: string; url: string; uploadUrl: string }> {
    const client = this.requireClient();
    const month = new Date().toISOString().slice(0, 7);
    const key = `schools/${schoolId}/${month}/${randomUUID()}.${EXTENSIONS[contentType] ?? 'bin'}`;
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_S },
    );
    return { key, url: `${this.publicBase}/${key}`, uploadUrl };
  }

  /** Xatolik post o'chirilishiga to'sqinlik qilmaydi — faqat log */
  async remove(key: string): Promise<void> {
    if (!this.client) return;
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch((err: Error) => this.logger.warn(`Faylni o'chirib bo'lmadi (${key}): ${err.message}`));
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Media saqlash sozlanmagan: apps/api/.env dagi S3_* qiymatlarini to'ldiring (docs/content-plan-setup.md)",
      );
    }
    return this.client;
  }
}
