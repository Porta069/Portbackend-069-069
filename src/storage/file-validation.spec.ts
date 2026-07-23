import { sanitizeFilename, validateFileContent } from './file-validation';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header

describe('validateFileContent', () => {
  it('accepts a real PNG as a photo', () => {
    expect(validateFileContent(PNG, 'photo').mime).toBe('image/png');
  });

  it('accepts a real PDF as a CV', () => {
    expect(validateFileContent(PDF, 'cv').mime).toBe('application/pdf');
  });

  it('rejects a PDF disguised claim when bytes are an executable', () => {
    expect(() => validateFileContent(EXE, 'cv')).toThrow();
  });

  it('rejects a JPEG for the CV category (wrong type for category)', () => {
    expect(() => validateFileContent(JPEG, 'cv')).toThrow();
  });

  it('accepts a JPEG as a qualification', () => {
    expect(validateFileContent(JPEG, 'qualification').mime).toBe('image/jpeg');
  });
});

describe('sanitizeFilename', () => {
  it('strips path traversal components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Windows\\evil.doc')).toBe('evil.doc');
  });

  it('removes shell/metacharacters but keeps safe parentheses', () => {
    const out = sanitizeFilename('rm -rf $(whoami).pdf');
    // Shell metacharacters like `$` are stripped; parentheses are safe in a
    // display-only filename (storage keys are randomized regardless).
    expect(out).not.toMatch(/[$;&|`<>]/);
    expect(out).toBe('rm -rf _(whoami).pdf');
  });

  it('never returns an empty string', () => {
    expect(sanitizeFilename('///')).toBe('file');
  });
});
