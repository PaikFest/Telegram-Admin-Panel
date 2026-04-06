import { constants } from 'node:fs';
import { access, open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const UPLOADS_DIR = resolve(process.cwd(), 'storage', 'uploads');

const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isPathInsideUploadsDir(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const basePath = resolve(UPLOADS_DIR);
  const candidatePath = resolve(filePath);

  const normalizedBase = process.platform === 'win32' ? basePath.toLowerCase() : basePath;
  const normalizedCandidate =
    process.platform === 'win32' ? candidatePath.toLowerCase() : candidatePath;

  if (normalizedCandidate === normalizedBase) {
    return true;
  }

  return normalizedCandidate.startsWith(`${normalizedBase}${sep}`);
}

function detectImageMimeFromHeader(header: Buffer): string | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    header.length >= 4 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38
  ) {
    return 'image/gif';
  }

  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

async function readFileHeader(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export async function validateStagedImageFile(
  filePath: string,
  mimeType?: string | null,
): Promise<{
  valid: boolean;
  detectedMimeType: string | null;
  reason: string | null;
}> {
  if (!isPathInsideUploadsDir(filePath)) {
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'Invalid upload path',
    };
  }

  try {
    await access(filePath, constants.F_OK | constants.R_OK);
  } catch {
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'Upload file is missing',
    };
  }

  let header: Buffer;
  try {
    header = await readFileHeader(filePath, 16);
  } catch {
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'Upload file cannot be read',
    };
  }

  const detectedMimeType = detectImageMimeFromHeader(header);
  if (!detectedMimeType) {
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'Unsupported or invalid image file',
    };
  }

  const normalizedProvidedMime =
    typeof mimeType === 'string' && mimeType.trim().length > 0
      ? mimeType.trim().toLowerCase()
      : null;

  if (normalizedProvidedMime && !ALLOWED_IMAGE_MIME_TYPES.has(normalizedProvidedMime)) {
    return {
      valid: false,
      detectedMimeType,
      reason: 'Unsupported image mime type',
    };
  }

  return {
    valid: true,
    detectedMimeType,
    reason: null,
  };
}
