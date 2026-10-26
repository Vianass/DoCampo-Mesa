import { z } from 'zod';
import {
  maximumProductPriceCents,
  minimumProductPriceCents,
  productCategories,
  productStates,
  saleModalities,
} from '../products/product.constants.js';

export const catalogId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/)
  .transform((value) => value.toLowerCase());
export const catalogSorts = [
  'relevancia',
  'preco-asc',
  'preco-desc',
  'nome-asc',
  'nome-desc',
  'recentes',
] as const;
export const catalogSeasons = {
  Primavera: [3, 4, 5],
  Verão: [6, 7, 8],
  Outono: [9, 10, 11],
  Inverno: [12, 1, 2],
} as const;
const text = (maximum: number) =>
  z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .refine(
      (value) =>
        [...value].length >= 1 && [...value].length <= maximum && !/[\p{Cc}\p{Cs}]/u.test(value),
    );
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const paging = {
  pagina: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .refine((value) => value <= 1000)
    .default(1),
  porPagina: z.enum(['12', '24', '36']).transform(Number).default(12),
  ordem: z.enum(catalogSorts).default('relevancia'),
};
const search = text(100)
  .refine((value) => value.split(/\s+/).length <= 10)
  .optional();
const category = z.enum(productCategories.map((item) => item.id));
export const publicCatalogQuery = z
  .strictObject({
    ...paging,
    pesquisa: search,
    categoria: category.optional(),
    produtor: catalogId.optional(),
    localidade: text(120).optional(),
    epoca: z.enum(['Primavera', 'Verão', 'Outono', 'Inverno']).optional(),
    mes: z
      .string()
      .regex(/^(?:[1-9]|1[0-2])$/)
      .transform(Number)
      .optional(),
    modoProducao: text(100).optional(),
    bio: z.enum(['true', 'false']).optional(),
    precoMax: z
      .string()
      .regex(/^\d{1,5}(?:[.,]\d{1,2})?$/)
      .transform((value) => {
        const [whole, fraction = ''] = value.replace(',', '.').split('.');
        return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      })
      .refine((value) => value <= maximumProductPriceCents)
      .optional(),
  })
  .refine((value) => !value.epoca || value.mes === undefined, {
    message: 'Escolhe mês ou estação.',
    path: ['epoca'],
  });
export const publicProducerQuery = z.strictObject({
  ...paging,
  ordem: z.enum(['relevancia', 'nome-asc', 'nome-desc', 'recentes']).default('relevancia'),
  pesquisa: search,
  localidade: text(120).optional(),
});
export const producerProductsQuery = z.strictObject(paging);
export const ownCatalogQuery = z.strictObject({
  ...paging,
  pesquisa: search,
  estado: z.enum(productStates).optional(),
});
export type CatalogQuery = z.infer<typeof publicCatalogQuery>;
export type ProducerQuery = z.infer<typeof publicProducerQuery>;
export type OwnCatalogQuery = z.infer<typeof ownCatalogQuery>;
const unit = z.strictObject({
  modalidade: z.enum(saleModalities).optional(),
  unidadeBase: z.enum(['g', 'ml', 'un']).optional(),
  quantidadeReferencia: integer.optional(),
  quantidadeMinima: integer.optional(),
  incrementoCompra: integer.optional(),
  rotulo: text(120).optional(),
  conteudoPorUnidade: z
    .strictObject({ quantidade: integer, unidade: z.enum(['g', 'ml', 'un']) })
    .optional(),
});
const image = z.strictObject({
  url: z
    .url()
    .max(4096)
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    }),
  alt: text(500).optional(),
  principal: z.boolean().optional(),
});
export const productWriteFields = {
  nome: text(200),
  descricao: text(5000).optional(),
  categoriaId: category.optional(),
  precoCent: z
    .number()
    .int()
    .min(minimumProductPriceCents)
    .max(maximumProductPriceCents)
    .optional(),
  unidadeVenda: unit.optional(),
  stockDisponivel: integer.optional(),
  ingredientesAplicaveis: z.boolean().optional(),
  ingredientes: z.array(text(500)).max(100).default([]),
  etiquetas: z.array(text(100)).max(50).default([]),
  epocaMeses: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  modoProducao: text(100).optional(),
  imagens: z.array(image).max(2).default([]),
};
export const productCreateSchema = z.strictObject(productWriteFields);
export const productReplaceSchema = z.strictObject({
  ...productWriteFields,
  estadoPublicacao: z.enum(productStates),
});
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductReplace = z.infer<typeof productReplaceSchema>;
export const productParams = z.strictObject({ id: catalogId });
export const emptyCatalogQuery = z.strictObject({});

/** Regex literal com equivalência das letras acentuadas portuguesas; não aceita expressões do cliente. */
export function catalogPattern(value: string, exact = false): string {
  const groups: Record<string, string> = {
    a: '[aàáâãäå]',
    e: '[eèéêë]',
    i: '[iìíîï]',
    o: '[oòóôõö]',
    u: '[uùúûü]',
    c: '[cç]',
    n: '[nñ]',
    y: '[yýÿ]',
  };
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-PT');
  const pattern = [...normalized]
    .map((char) => groups[char] ?? char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return exact ? '^' + pattern + '$' : pattern;
}
