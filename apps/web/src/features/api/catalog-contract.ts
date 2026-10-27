import type { ProductCategory, SaleUnit } from '../../types/market';

// Taxonomia pública estável da Fase 5A; não depende da página de resultados.
export const categories: readonly { id: string; name: ProductCategory }[] = [
  { id: 'cat-001', name: 'Hortícolas' },
  { id: 'cat-002', name: 'Fruta' },
  { id: 'cat-003', name: 'Leguminosas e cereais' },
  { id: 'cat-004', name: 'Pão e padaria' },
  { id: 'cat-005', name: 'Laticínios e queijos' },
  { id: 'cat-006', name: 'Ovos' },
  { id: 'cat-007', name: 'Mel e compotas' },
  { id: 'cat-008', name: 'Azeite e azeitonas' },
  { id: 'cat-009', name: 'Frutos secos e sementes' },
  { id: 'cat-010', name: 'Ervas e aromáticas' },
  { id: 'cat-011', name: 'Bebidas' },
  { id: 'cat-012', name: 'Outros produtos locais' },
];
export interface PageDto<T> {
  itens: T[];
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}
export interface ImageDto {
  url: string;
  alt?: string;
}
export interface CommercialDto {
  modalidades?: { levantamento: boolean; entrega: boolean };
  taxaEntregaCent?: number;
  concelhosEntregaIds?: string[];
  metodosPagamento?: string[];
  disponibilidade?: { fusoHorario?: string; levantamento?: PeriodDto[]; entrega?: PeriodDto[] };
}
interface PeriodDto {
  diaSemana: number;
  inicio: string;
  fim: string;
}
export interface ProducerDto {
  id: string;
  nomePublico: string;
  localidade: string;
  concelho: string;
  descricao: string;
  imagem?: ImageDto;
  comercial?: CommercialDto;
  createdAt: string;
  updatedAt: string;
}
export interface ProducerDetailDto extends ProducerDto {
  produtos: PageDto<ProductDto>;
}
export interface ProductDto {
  id: string;
  nome: string;
  descricao: string;
  precoCent: number;
  moeda: 'EUR';
  unidadeVenda: SaleUnit;
  categoria: { id: string; nome: string };
  stockDisponivel: number;
  disponivel: boolean;
  ingredientesAplicaveis: boolean;
  ingredientes: string[];
  etiquetas: string[];
  epocaMeses?: number[];
  modoProducao?: string;
  imagens: (ImageDto & { principal: boolean })[];
  produtor: {
    id: string;
    nomePublico: string;
    localidade: string;
    concelho: string;
    imagem?: ImageDto;
  };
  comercial?: CommercialDto;
  createdAt: string;
  updatedAt: string;
}
export function objectId(value: string) {
  return /^[a-fA-F0-9]{24}$/.test(value);
}
export class InvalidResponse extends Error {
  constructor() {
    super('Resposta do catálogo inválida.');
  }
}
function assert(value: unknown): asserts value {
  if (!value) throw new InvalidResponse();
}
function record(value: unknown): asserts value is Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value));
}
function text(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0);
}
function integer(value: unknown, min = 0): asserts value is number {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= min);
}
function strings(value: unknown): asserts value is string[] {
  assert(Array.isArray(value));
  value.forEach(text);
}
function date(value: unknown) {
  text(value);
  assert(Number.isFinite(Date.parse(value)));
}
function id(value: unknown) {
  text(value);
  assert(objectId(value));
}
function url(value: unknown) {
  text(value);
  const u = new URL(value);
  assert(['http:', 'https:'].includes(u.protocol) && !u.username && !u.password);
}
function image(value: unknown) {
  record(value);
  url(value.url);
  if (value.alt !== undefined) text(value.alt);
}
export function parseSale(value: unknown): SaleUnit {
  record(value);
  const definitions = {
    peso: ['g', 1000],
    volume: ['ml', 1000],
    unidade: ['un', 1],
    embalagem: ['un', 1],
  } as const;
  text(value.modalidade);
  assert(value.modalidade in definitions);
  const definition = definitions[value.modalidade as keyof typeof definitions];
  assert(value.unidadeBase === definition[0] && value.quantidadeReferencia === definition[1]);
  integer(value.quantidadeMinima, 1);
  integer(value.incrementoCompra, 1);
  if (value.rotulo !== undefined) text(value.rotulo);
  if (value.conteudoPorUnidade !== undefined) {
    record(value.conteudoPorUnidade);
    integer(value.conteudoPorUnidade.quantidade, 1);
    assert(['g', 'ml', 'un'].includes(String(value.conteudoPorUnidade.unidade)));
  }
  return value as unknown as SaleUnit;
}
function commercial(value: unknown) {
  if (value === undefined) return;
  record(value);
  if (value.modalidades !== undefined) {
    record(value.modalidades);
    assert(
      typeof value.modalidades.levantamento === 'boolean' &&
        typeof value.modalidades.entrega === 'boolean',
    );
  }
  if (value.taxaEntregaCent !== undefined) integer(value.taxaEntregaCent);
  for (const key of ['concelhosEntregaIds', 'metodosPagamento'])
    if (value[key] !== undefined) strings(value[key]);
  if (value.disponibilidade !== undefined) {
    record(value.disponibilidade);
    const v = value.disponibilidade;
    if (v.fusoHorario !== undefined) text(v.fusoHorario);
    for (const key of ['levantamento', 'entrega'])
      if (v[key] !== undefined) {
        assert(Array.isArray(v[key]));
        for (const period of v[key]) {
          record(period);
          integer(period.diaSemana, 1);
          assert(period.diaSemana <= 7);
          for (const t of [period.inicio, period.fim])
            assert(typeof t === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
        }
      }
  }
}
export function parseProduct(value: unknown): ProductDto {
  record(value);
  id(value.id);
  for (const key of ['nome', 'descricao']) text(value[key]);
  integer(value.precoCent, 1);
  assert(value.precoCent <= 1000000 && value.moeda === 'EUR');
  parseSale(value.unidadeVenda);
  integer(value.stockDisponivel);
  assert(value.disponivel === value.stockDisponivel > 0);
  record(value.categoria);
  const category = value.categoria;
  assert(categories.some((c) => c.id === category.id && c.name === category.nome));
  assert(typeof value.ingredientesAplicaveis === 'boolean');
  strings(value.ingredientes);
  strings(value.etiquetas);
  if (value.epocaMeses !== undefined) {
    assert(Array.isArray(value.epocaMeses));
    value.epocaMeses.forEach((m) => {
      integer(m, 1);
      assert(m <= 12);
    });
  }
  if (value.modoProducao !== undefined) text(value.modoProducao);
  assert(Array.isArray(value.imagens) && value.imagens.length > 0 && value.imagens.length <= 2);
  value.imagens.forEach((v) => {
    image(v);
    record(v);
    assert(typeof v.principal === 'boolean');
  });
  assert(value.imagens.filter((v) => v.principal).length === 1);
  record(value.produtor);
  id(value.produtor.id);
  for (const key of ['nomePublico', 'localidade', 'concelho']) text(value.produtor[key]);
  if (value.produtor.imagem !== undefined) image(value.produtor.imagem);
  commercial(value.comercial);
  date(value.createdAt);
  date(value.updatedAt);
  return value as unknown as ProductDto;
}
export function parseProducer(value: unknown): ProducerDto {
  record(value);
  id(value.id);
  for (const key of ['nomePublico', 'localidade', 'concelho', 'descricao']) text(value[key]);
  if (value.imagem !== undefined) image(value.imagem);
  commercial(value.comercial);
  date(value.createdAt);
  date(value.updatedAt);
  return value as unknown as ProducerDto;
}
export function parsePage<T>(value: unknown, parse: (v: unknown) => T): PageDto<T> {
  record(value);
  assert(Array.isArray(value.itens));
  integer(value.pagina, 1);
  integer(value.porPagina, 1);
  integer(value.total);
  integer(value.totalPaginas);
  assert(
    [12, 24, 36].includes(value.porPagina) &&
      value.pagina <= 1000 &&
      value.totalPaginas === Math.ceil(value.total / value.porPagina),
  );
  const expected = Math.max(
    0,
    Math.min(value.porPagina, value.total - (value.pagina - 1) * value.porPagina),
  );
  assert(value.itens.length === expected);
  return {
    itens: value.itens.map(parse),
    pagina: value.pagina,
    porPagina: value.porPagina,
    total: value.total,
    totalPaginas: value.totalPaginas,
  };
}
export function parseProducerDetail(value: unknown): ProducerDetailDto {
  const producer = parseProducer(value);
  record(value);
  const produtos = parsePage(value.produtos, parseProduct);
  assert(produtos.itens.every((p) => p.produtor.id === producer.id));
  return { ...producer, produtos };
}
