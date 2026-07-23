import { BadRequestException } from '@nestjs/common';

/**
 * Content-based file validation. The declared MIME type from a multipart
 * request is attacker-controlled, so we verify the actual magic bytes and only
 * accept an explicit allowlist per document category.
 */

export type FileCategory = 'photo' | 'cv' | 'qualification';

interface Signature {
  mime: string;
  ext: string;
  // Byte sequence expected at `offset`.
  magic: number[];
  offset: number;
}

const SIGNATURES: Signature[] = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff], offset: 0 },
  {
    mime: 'image/png',
    ext: 'png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    offset: 0,
  },
  { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  // DOC (legacy OLE compound file)
  {
    mime: 'application/msword',
    ext: 'doc',
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    offset: 0,
  },
  // DOCX / any OOXML is a ZIP container: "PK\x03\x04"
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    magic: [0x50, 0x4b, 0x03, 0x04],
    offset: 0,
  },
];

const ALLOWED_BY_CATEGORY: Record<FileCategory, string[]> = {
  photo: ['image/jpeg', 'image/png'],
  cv: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  qualification: ['application/pdf', 'image/jpeg', 'image/png'],
};

/**
 * The DOCX/OOXML signature is just the generic ZIP magic (PK\x03\x04), so a
 * renamed .zip/.xlsx/.jar or a macro-enabled .docm would pass a bare magic
 * check. Inspect the archive's (plaintext) entry names to confirm it is really
 * a Word document and reject macro-bearing containers.
 */
function assertValidDocx(buffer: Buffer): void {
  const names = buffer.toString('latin1');
  if (names.includes('vbaProject.bin')) {
    throw new BadRequestException('Macro-enabled documents are not permitted');
  }
  if (!names.includes('word/document.xml')) {
    throw new BadRequestException('File is not a valid Word document');
  }
}

function matches(buffer: Buffer, sig: Signature): boolean {
  if (buffer.length < sig.offset + sig.magic.length) return false;
  for (let i = 0; i < sig.magic.length; i++) {
    if (buffer[sig.offset + i] !== sig.magic[i]) return false;
  }
  return true;
}

export interface DetectedFile {
  mime: string;
  ext: string;
}

/**
 * Detects the true type from magic bytes and asserts it is allowed for the
 * given category. Throws BadRequestException on mismatch / disallowed type.
 *
 * Note: `.docx` and `.doc` share the ZIP/OLE container shape with other Office
 * formats; we accept them for CVs which is the intended use.
 */
export function validateFileContent(
  buffer: Buffer,
  category: FileCategory,
): DetectedFile {
  const allowed = ALLOWED_BY_CATEGORY[category];
  const detected = SIGNATURES.find((s) => matches(buffer, s));

  if (!detected) {
    throw new BadRequestException(
      `Unrecognized or unsupported file content for ${category}`,
    );
  }
  if (!allowed.includes(detected.mime)) {
    throw new BadRequestException(
      `File type ${detected.mime} is not permitted for ${category}`,
    );
  }
  // OOXML containers need structural validation beyond the ZIP magic.
  if (detected.ext === 'docx') {
    assertValidDocx(buffer);
  }
  return { mime: detected.mime, ext: detected.ext };
}

/** Strips path components and dangerous characters from a client filename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || 'file';
}
