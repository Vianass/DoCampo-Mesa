import { describe, it, expect, vi } from 'vitest';
import { startApi } from '../../src/runtime.js';
import { parseEnvironment } from '../../src/config/environment.js';
import sharp from 'sharp';
import { profileInput } from '../../src/modules/producers/producer-management.validation.js';
import { productCreateSchema } from '../../src/modules/catalog/catalog.validation.js';
import { developmentImageStorage } from '../../src/modules/images/image.storage.js';
import { normalizeImage, maximumImageBytes } from '../../src/modules/images/image.validation.js';
const profile = {
  nomePublico: 'Horta fictícia',
  localidade: 'Viana',
  concelho: 'Viana do Castelo',
  descricao: 'Produção de teste',
  telefone: 'Contacto fictício',
  comercial: null,
};
describe('gestão do produtor: contratos e imagens', () => {
  it('perfil próprio substitui apenas campos editáveis e permite loja ainda não configurada', () =>
    expect(profileInput.parse(profile)).toEqual(profile));
  it.each(['userId', 'aprovacao', 'papeis', 'revisaoOperacional', 'historicoCandidaturas'])(
    'não aceita autoridade em %s',
    (field) =>
      expect(profileInput.safeParse({ ...profile, [field]: 'injetado' }).success).toBe(false),
  );
  it.each([-1, 1.5, '10', null, Number.MAX_SAFE_INTEGER])(
    'rejeita limiar inválido %s',
    (limiarStockBaixo) =>
      expect(productCreateSchema.safeParse({ nome: 'Teste', limiarStockBaixo }).success).toBe(
        false,
      ),
  );
  it('limiar é opcional, não um valor inventado, e aceita zero explícito', () => {
    expect(productCreateSchema.parse({ nome: 'Teste' }).limiarStockBaixo).toBeUndefined();
    expect(productCreateSchema.parse({ nome: 'Teste', limiarStockBaixo: 0 }).limiarStockBaixo).toBe(
      0,
    );
  });
  it('valida e normaliza JPEG/PNG/WebP em bytes WebP sem metadados privados', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const original = await sharp({
        create: { width: 30, height: 20, channels: 3, background: '#193c34' },
      })
        .toFormat(format)
        .toBuffer();
      const result = await normalizeImage(original, 'image/' + format),
        meta = await sharp(result).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.width).toBe(30);
    }
  });
  it('não confia apenas no MIME ou na extensão declarada', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await expect(normalizeImage(png, 'image/jpeg')).rejects.toMatchObject({ status: 400 });
    await expect(
      normalizeImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(normalizeImage(Buffer.from('imagem'), 'image/svg+xml')).rejects.toMatchObject({
      status: 415,
    });
  });
  it('recusa tamanho excessivo e uma imagem truncada', async () => {
    await expect(
      normalizeImage(Buffer.alloc(maximumImageBytes + 1), 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(normalizeImage(Buffer.from([137, 80, 78, 71]), 'image/png')).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it('recusa imagem acima do limite de píxeis', async () => {
    const png = await sharp({
      create: { width: 4100, height: 4100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(normalizeImage(png, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it('adaptador local não funciona em produção nem dentro do repositório', () => {
    expect(() =>
      developmentImageStorage('/private/tmp/test-media', 'http://example.invalid/api/media', true),
    ).toThrow();
    expect(() =>
      developmentImageStorage(process.cwd(), 'http://example.invalid/api/media'),
    ).toThrow();
    expect(() => developmentImageStorage('relativo', 'http://example.invalid/api/media')).toThrow();
  });
});

it('arranque de produção recusa o adaptador local e fecha a ligação antes de abrir HTTP', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const previous = process.env.MEDIA_STORAGE;
  process.env.MEDIA_STORAGE = 'development';
  try {
    const config = parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/',
      MONGODB_DB_NAME: 'docampo_test_configuration',
    });
    await expect(startApi(config, { connect: async () => ({ close }) })).rejects.toThrow(
      'proibido em produção',
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    if (previous === undefined) delete process.env.MEDIA_STORAGE;
    else process.env.MEDIA_STORAGE = previous;
  }
});
