import { createHash } from 'node:crypto';
import type { CloudinaryConfiguration } from '../../config/media-environment.js';
import { ImageStorageUnavailable, type ImageStorage } from './image.storage.js';
import { maximumImageBytes } from './image.validation.js';

const imageId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/;
interface CloudinaryDependencies {
  fetch?: typeof fetch;
  now?: () => number;
}
async function bounded(response: Response, limit: number) {
  if (Number(response.headers.get('content-length')) > limit || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new ImageStorageUnavailable();
  }
  const reader = response.body.getReader(),
    chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ImageStorageUnavailable();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new ImageStorageUnavailable();
  } finally {
    reader.releaseLock();
  }
}
/** Objetos authenticated; o browser recebe exclusivamente URLs do gateway autorizado da API. */
export function cloudinaryImageStorage(
  configuration: CloudinaryConfiguration,
  dependencies: CloudinaryDependencies = {},
): ImageStorage {
  const transport = dependencies.fetch ?? fetch,
    now = dependencies.now ?? Date.now;
  const base = `https://api.cloudinary.com/v1_1/${configuration.cloudName}/image`;
  const basic =
    'Basic ' + Buffer.from(configuration.apiKey + ':' + configuration.apiSecret).toString('base64');
  function publicId(id: string) {
    if (!imageId.test(id)) throw new Error('Identificador de imagem inválido.');
    return configuration.folder + '/' + id.slice(0, -5);
  }
  async function send(url: string, init: RequestInit) {
    try {
      return await transport(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ImageStorageUnavailable();
    }
  }
  async function json(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ImageStorageUnavailable();
    }
    try {
      const value: unknown = JSON.parse((await bounded(response, 64 * 1024)).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
      return value as Record<string, unknown>;
    } catch {
      throw new ImageStorageUnavailable();
    }
  }
  return {
    kind: 'cloud',
    provider: 'cloudinary',
    namespace: configuration.cloudName + ':' + configuration.folder,
    publicBase: configuration.publicBase,
    async put(id, bytes) {
      const expected = publicId(id);
      if (!bytes.length || bytes.length > maximumImageBytes) throw new ImageStorageUnavailable();
      const body = new FormData();
      body.set('public_id', expected);
      body.set('overwrite', 'false');
      body.set('use_filename', 'false');
      body.set('unique_filename', 'false');
      body.set('file', new Blob([Uint8Array.from(bytes)], { type: 'image/webp' }), id);
      const result = await json(
        await send(base + '/authenticated', {
          method: 'POST',
          headers: { Authorization: basic },
          body,
        }),
      );
      if (
        result.public_id !== expected ||
        result.resource_type !== 'image' ||
        result.type !== 'authenticated' ||
        result.format !== 'webp' ||
        result.existing === true ||
        result.existed === true ||
        typeof result.bytes !== 'number' ||
        result.bytes < 1 ||
        result.bytes > maximumImageBytes
      )
        throw new ImageStorageUnavailable();
    },
    async read(id) {
      const timestamp = Math.floor(now() / 1000),
        parameters = {
          public_id: publicId(id),
          format: 'webp',
          type: 'authenticated',
          timestamp: String(timestamp),
          expires_at: String(timestamp + 60),
        };
      const signed = Object.entries(parameters)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => k + '=' + v)
        .join('&');
      const signature = createHash('sha256')
        .update(signed + configuration.apiSecret)
        .digest('hex');
      const query = new URLSearchParams({
        ...parameters,
        api_key: configuration.apiKey,
        signature,
      });
      const response = await send(base + '/download?' + query, { method: 'GET' });
      if (response.status === 404) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('Imagem não disponível.');
      }
      if (
        !response.ok ||
        !/^(?:image\/webp|application\/octet-stream)(?:;|$)/i.test(
          response.headers.get('content-type') ?? '',
        )
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new ImageStorageUnavailable();
      }
      const bytes = await bounded(response, maximumImageBytes);
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP')
        throw new ImageStorageUnavailable();
      return bytes;
    },
    async remove(id) {
      const body = new URLSearchParams({
        public_id: publicId(id),
        type: 'authenticated',
        invalidate: 'true',
      });
      const response = await json(
        await send(base + '/destroy', { method: 'POST', headers: { Authorization: basic }, body }),
      );
      if (!['ok', 'not found'].includes(String(response.result)))
        throw new ImageStorageUnavailable();
    },
  };
}
