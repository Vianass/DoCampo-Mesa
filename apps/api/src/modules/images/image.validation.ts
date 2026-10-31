import sharp from 'sharp';
import { ApiError } from '../../http/api-error.js';
export const maximumImageBytes = 5 * 1024 * 1024;
let processing = 0;
export async function normalizeImage(input: unknown, contentType: string) {
  const formats: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (!formats[contentType])
    throw new ApiError(415, 'IMAGEM_INVALIDA', 'Utiliza JPEG, PNG ou WebP sem animação.');
  if (!Buffer.isBuffer(input) || !input.length || input.length > maximumImageBytes)
    throw new ApiError(400, 'IMAGEM_INVALIDA', 'Escolhe uma fotografia até 5 MiB.');
  if (processing >= 2)
    throw new ApiError(429, 'IMAGENS_OCUPADAS', 'Aguarda a preparação das fotografias em curso.');
  processing++;
  try {
    const image = sharp(input, { failOn: 'warning', limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== formats[contentType] || (metadata.pages ?? 1) !== 1)
      throw new Error('Formato inválido.');
    const bytes = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer();
    if (bytes.length > maximumImageBytes) throw new Error('Imagem demasiado grande.');
    return bytes;
  } catch {
    throw new ApiError(
      400,
      'IMAGEM_INVALIDA',
      'A fotografia está danificada, excede 16 megapíxeis ou tem um formato não permitido.',
    );
  } finally {
    processing--;
  }
}
