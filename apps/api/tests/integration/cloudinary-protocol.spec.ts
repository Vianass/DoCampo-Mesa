import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import sharp from 'sharp';
import { cloudinaryImageStorage } from '../../src/modules/images/cloudinary.storage.js';
import { parseCloudinaryEnvironment } from '../../src/config/media-environment.js';
import { ImageStorageUnavailable } from '../../src/modules/images/image.storage.js';
// Servidor HTTP local que valida o protocolo; não é prova de execução no fornecedor real.
const fake = {
  cloudName: 'conta-ficticia',
  apiKey: '123456789012345',
  apiSecret: 'Segredo_Ficticio_Apenas_Para_Protocolo',
  folder: 'ensaio',
  publicBase: 'https://api.example.invalid/api/media',
};
const id = '12345678-1234-1234-1234-123456789abc.webp';
let bytes: Buffer,
  url: string,
  mode = 'ok',
  calls = 0;
const server = createServer(async (req, res) => {
  try {
    calls++;
    const parsed = new URL(req.url!, 'http://localhost');
    if (mode === 'redirect') {
      res.writeHead(302, { Location: 'https://untrusted.example.invalid/' }).end();
      return;
    }
    if (mode === 'outage') {
      res.writeHead(503).end(fake.apiSecret);
      return;
    }
    if (parsed.pathname.endsWith('/authenticated')) {
      expect(req.headers.authorization).toBe(
        'Basic ' + Buffer.from(fake.apiKey + ':' + fake.apiSecret).toString('base64'),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = await new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'Content-Type': String(req.headers['content-type']) },
        body: Uint8Array.from(Buffer.concat(chunks)),
      }).formData();
      expect(body.get('public_id')).toBe('ensaio/' + id.slice(0, -5));
      expect(body.get('overwrite')).toBe('false');
      expect(Buffer.from(await (body.get('file') as Blob).arrayBuffer())).toEqual(bytes);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          public_id: mode === 'wrong-id' ? 'alheio' : body.get('public_id'),
          type: 'authenticated',
          resource_type: 'image',
          format: 'webp',
          bytes: bytes.length,
          existing: false,
        }),
      );
    } else if (parsed.pathname.endsWith('/download')) {
      expect(parsed.searchParams.get('type')).toBe('authenticated');
      expect(parsed.searchParams.get('api_key')).toBe(fake.apiKey);
      const values = Object.fromEntries(parsed.searchParams);
      delete values.api_key;
      const signature = values.signature;
      delete values.signature;
      expect(signature).toBe(
        createHash('sha256')
          .update(
            Object.keys(values)
              .sort()
              .map((k) => k + '=' + values[k])
              .join('&') + fake.apiSecret,
          )
          .digest('hex'),
      );
      expect(Number(values.expires_at) - Number(values.timestamp)).toBe(60);
      if (mode === 'missing') {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('Content-Type', mode === 'octet' ? 'application/octet-stream' : 'image/webp');
      if (mode === 'too-large') res.setHeader('Content-Length', 6 * 1024 * 1024);
      res.end(mode === 'invalid-bytes' ? Buffer.from('<script>inválido</script>') : bytes);
    } else if (parsed.pathname.endsWith('/destroy')) {
      expect(req.headers.authorization).toBe(
        'Basic ' + Buffer.from(fake.apiKey + ':' + fake.apiSecret).toString('base64'),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      expect(body.get('type')).toBe('authenticated');
      expect(body.get('public_id')).toBe('ensaio/' + id.slice(0, -5));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result: mode === 'already-absent' ? 'not found' : 'ok' }));
    } else res.writeHead(404).end();
  } catch {
    res.writeHead(500).end('Protocolo não corresponde ao contrato.');
  }
});
beforeAll(async () => {
  bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#193c34' } })
    .webp()
    .toBuffer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error();
  url = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const transport: typeof fetch = async (input, init) => {
  const target = new URL(String(input));
  expect(target.origin).toBe('https://api.cloudinary.com');
  expect(target.href).not.toContain(fake.apiSecret);
  return fetch(url + target.pathname + target.search, init);
};
const storage = () =>
  cloudinaryImageStorage(fake, { fetch: transport, now: () => 1_800_000_000_000 });
it('upload HTTP autenticado imutável, leitura assinada curta e eliminação explícita no namespace', async () => {
  mode = 'ok';
  const cloud = storage();
  await cloud.put(id, bytes);
  expect(await cloud.read(id)).toEqual(bytes);
  await cloud.remove!(id);
  expect(cloud.publicBase).toBe(fake.publicBase);
  expect(cloud.kind).toBe('cloud');
  expect(cloud.namespace).toBe('conta-ficticia:ensaio');
});
it('aceita a descarga binária WebP e a eliminação idempotente de objeto já ausente', async () => {
  mode = 'octet';
  expect(await storage().read(id)).toEqual(bytes);
  mode = 'already-absent';
  await storage().remove!(id);
});
it.each(['outage', 'redirect', 'too-large', 'invalid-bytes'])(
  'falha de leitura %s não expõe informação do fornecedor nem segue redirects',
  async (value) => {
    mode = value;
    await expect(storage().read(id)).rejects.toBeInstanceOf(ImageStorageUnavailable);
  },
);
it('não aceita substituição de ID nem credenciais vazias/URLs públicas inseguras', async () => {
  mode = 'wrong-id';
  await expect(storage().put(id, bytes)).rejects.toBeInstanceOf(ImageStorageUnavailable);
  for (const value of [
    {},
    {
      CLOUDINARY_CLOUD_NAME: 'x',
      CLOUDINARY_API_KEY: fake.apiKey,
      CLOUDINARY_API_SECRET: fake.apiSecret,
      MEDIA_PUBLIC_BASE: 'http://inseguro.invalid/api/media',
    },
  ])
    expect(() => parseCloudinaryEnvironment(value)).toThrow();
});
it('rejeita caminhos arbitrários antes de qualquer pedido externo', async () => {
  const before = calls;
  await expect(storage().read('../alheio')).rejects.toThrow();
  await expect(storage().remove!('../alheio')).rejects.toThrow();
  expect(calls).toBe(before);
});
