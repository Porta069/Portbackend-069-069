import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DocumentType, OtpChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { verifyVerificationToken } from '../otp/verification-token';
import {
  FileCategory,
  sanitizeFilename,
  validateFileContent,
} from '../storage/file-validation';
import { normalizeEmail, normalizePhone } from '../common/contact/contact.util';
import { OtpConfig, RetentionConfig, SecurityConfig } from '../config/configuration';

interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

interface UploadInputs {
  cv?: IncomingFile[];
  photo?: IncomingFile[];
  qualifications?: IncomingFile[];
}

const MIN_AGE_YEARS = 16;
const MAX_AGE_YEARS = 100;

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get maxUploadBytes(): number {
    return this.config.get<SecurityConfig>('security')!.maxUploadBytes;
  }

  private get verificationTokenSecret(): string {
    return this.config.get<OtpConfig>('otp')!.verificationTokenSecret;
  }

  /** Validates age from the full birth date and returns only the birth YEAR. */
  private ageCheck(birthDate: string): { birthYear: number } {
    const dob = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) {
      throw new BadRequestException('Invalid birth date');
    }
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const m = now.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;

    if (age < MIN_AGE_YEARS) {
      throw new BadRequestException(
        `Applicants must be at least ${MIN_AGE_YEARS} years old`,
      );
    }
    if (age > MAX_AGE_YEARS) {
      throw new BadRequestException('Invalid birth date');
    }
    return { birthYear: dob.getUTCFullYear() };
  }

  /**
   * Validates the verification token (signature, expiry, and that it was issued
   * for the exact contact being submitted). Returns the verified channel.
   * The single-use consumption of its `jti` happens atomically in create().
   */
  private checkVerification(dto: CreateApplicationDto): {
    channel: OtpChannel;
    jti: string;
    exp: number;
  } {
    const payload = verifyVerificationToken(
      dto.verificationToken,
      this.verificationTokenSecret,
    );
    if (!payload) {
      throw new ForbiddenException('Missing or invalid verification');
    }
    const matches =
      payload.channel === 'EMAIL'
        ? payload.contact === normalizeEmail(dto.email)
        : payload.contact === normalizePhone(dto.phone);
    if (!matches) {
      throw new ForbiddenException(
        'Verification does not match the submitted contact details',
      );
    }
    return { channel: payload.channel, jti: payload.jti, exp: payload.exp };
  }

  private assertFileSize(file: IncomingFile): void {
    if (file.size > this.maxUploadBytes) {
      throw new BadRequestException('File exceeds the maximum allowed size');
    }
  }

  async create(
    dto: CreateApplicationDto,
    files: UploadInputs,
    ip?: string,
  ): Promise<{ id: string; status: string }> {
    // 1. Cheap gates first: consent, verification, age.
    if (dto.consent !== true) {
      throw new BadRequestException('Consent is required to submit');
    }
    const verification = this.checkVerification(dto);
    const { birthYear } = this.ageCheck(dto.birthDate);

    // 2. CV is mandatory; a photo requires its own explicit consent.
    const cv = files.cv?.[0];
    if (!cv) {
      throw new BadRequestException('A CV document is required');
    }
    const photo = files.photo?.[0];
    if (photo && dto.consentPhoto !== true) {
      throw new BadRequestException(
        'A separate consent is required to store a profile photo',
      );
    }

    // 3. Validate every file's real content type + size before any upload.
    const toProcess: {
      file: IncomingFile;
      type: DocumentType;
      category: FileCategory;
    }[] = [];
    this.assertFileSize(cv);
    toProcess.push({ file: cv, type: DocumentType.CV, category: 'cv' });
    if (photo) {
      this.assertFileSize(photo);
      toProcess.push({ file: photo, type: DocumentType.PHOTO, category: 'photo' });
    }
    for (const q of files.qualifications ?? []) {
      this.assertFileSize(q);
      toProcess.push({
        file: q,
        type: DocumentType.QUALIFICATION,
        category: 'qualification',
      });
    }

    const applicationId = randomUUID();
    const uploadedKeys: string[] = [];
    const documents: Prisma.DocumentCreateWithoutApplicationInput[] = [];

    try {
      for (const item of toProcess) {
        const detected = validateFileContent(item.file.buffer, item.category);
        const stored = await this.storage.upload(
          `applications/${applicationId}`,
          item.file.buffer,
          detected.mime,
          detected.ext,
        );
        uploadedKeys.push(stored.storageKey);
        documents.push({
          type: item.type,
          storageKey: stored.storageKey,
          originalName: sanitizeFilename(item.file.originalname),
          mimeType: detected.mime,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
        });
      }

      const retentionDays = this.config.get<RetentionConfig>('retention')!
        .applicationRetentionDays;
      const retentionUntil = new Date(
        Date.now() + retentionDays * 24 * 60 * 60 * 1000,
      );

      // Consume the verification token's jti and create the record atomically:
      // a replayed token collides on the jti PK and rolls the whole thing back.
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.usedVerificationToken.create({
          data: {
            jti: verification.jti,
            expiresAt: new Date(verification.exp),
          },
        });
        return tx.application.create({
          data: {
            id: applicationId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            birthYear,
            ageVerified: true,
            email: normalizeEmail(dto.email),
            phone: normalizePhone(dto.phone),
            profession: dto.profession?.trim(),
            federalState: dto.federalState?.trim(),
            availability: dto.availability?.trim(),
            verified: true,
            verifiedVia: verification.channel,
            verifiedAt: new Date(),
            searchIntent:
              dto.searchIntent === 'active'
                ? 'ACTIVE'
                : dto.searchIntent === 'passive'
                  ? 'PASSIVE'
                  : undefined,
            consentAt: new Date(),
            consentText:
              dto.consentText?.slice(0, 2000) ??
              'Einwilligung zur Verarbeitung der Bewerbungsdaten zum Zweck der Personalvermittlung.',
            consentVersion: dto.consentVersion,
            consentPhoto: dto.consentPhoto === true,
            retentionUntil,
            documents: { create: documents },
          },
          select: { id: true, status: true },
        });
      });

      await this.audit.record({
        action: 'application.created',
        entityType: 'Application',
        entityId: created.id,
        ip,
        metadata: {
          documentCount: documents.length,
          verifiedVia: verification.channel,
        },
      });

      return { id: created.id, status: created.status };
    } catch (err) {
      // Best-effort cleanup of any objects already uploaded.
      await Promise.allSettled(
        uploadedKeys.map((key) => this.storage.delete(key)),
      );
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('jti')
      ) {
        throw new ForbiddenException('This verification has already been used');
      }
      this.logger.error(
        'Application creation failed; rolled back uploads',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  // ── Admin operations ───────────────────────────────────────────────────────

  async list(page = 1, pageSize = 20, email?: string, ip?: string) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.ApplicationWhereInput = {
      erasedAt: null,
      ...(email ? { email: normalizeEmail(email) } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          profession: true,
          federalState: true,
          verifiedVia: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    await this.audit.record({
      action: 'application.listed',
      entityType: 'Application',
      ip,
      metadata: { returned: items.length, filtered: Boolean(email) },
    });

    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async getById(id: string, ip?: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, erasedAt: null },
      include: { documents: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    // Attach short-lived, download-only signed URLs for internal review.
    const documents = await Promise.all(
      app.documents.map(async (doc) => ({
        id: doc.id,
        type: doc.type,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        downloadUrl: await this.storage.getSignedDownloadUrl(
          doc.storageKey,
          doc.originalName,
        ),
      })),
    );

    await this.audit.record({
      action: 'application.viewed',
      entityType: 'Application',
      entityId: id,
      ip,
    });

    return { ...app, documents };
  }

  /**
   * GDPR right to erasure: deletes stored files, then anonymizes the record —
   * but ONLY finalizes (`erasedAt`) once every object is confirmed gone. If any
   * object delete fails, the record stays flagged for retry by the retention
   * job so no PII is silently orphaned in the bucket.
   */
  async erase(id: string, ip?: string): Promise<{ id: string; erased: boolean }> {
    const app = await this.prisma.application.findFirst({
      where: { id, erasedAt: null },
      include: { documents: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    if (!app.erasureRequestedAt) {
      await this.prisma.application.update({
        where: { id },
        data: { erasureRequestedAt: new Date() },
      });
    }

    // Delete objects; track exactly which succeeded (S3 delete is idempotent,
    // so a missing key resolves rather than rejects).
    const results = await Promise.allSettled(
      app.documents.map((d) => this.storage.delete(d.storageKey)),
    );
    const deletedDocIds: string[] = [];
    let failures = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') deletedDocIds.push(app.documents[i].id);
      else failures++;
    });

    if (deletedDocIds.length) {
      await this.prisma.document.deleteMany({
        where: { id: { in: deletedDocIds } },
      });
    }

    if (failures > 0) {
      this.logger.error(
        `Erasure incomplete for ${id}: ${failures} object(s) remain; will retry`,
      );
      throw new InternalServerErrorException(
        'Erasure could not be completed; it will be retried automatically',
      );
    }

    // All objects gone → anonymize identifiers and finalize.
    await this.prisma.application.update({
      where: { id },
      data: {
        firstName: 'ERASED',
        lastName: 'ERASED',
        birthYear: null,
        ageVerified: false,
        email: `erased+${id}@invalid.local`,
        phone: '+000000000000',
        profession: null,
        federalState: null,
        availability: null,
        consentText: null,
        consentVersion: null,
        status: 'ERASED',
        erasedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'application.erased',
      entityType: 'Application',
      entityId: id,
      ip,
    });

    return { id, erased: true };
  }
}
