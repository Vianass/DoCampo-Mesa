import { parseVisibility, type VisibilityState } from '../moderation/contracts';
import { parsePublicLocation, type PublicLocation } from '../discovery/location';
import { record, text, number, id } from '../auctions/contracts';
import { InvalidResponse, parsePage } from '../api/catalog-contract';
import type { SaleUnit } from '../../types/market';
export const publicationLabels = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
};
export interface Photo {
  url: string;
  alt?: string;
  principal?: boolean;
}
export interface ProductInput {
  nome: string;
  descricao?: string;
  categoriaId?: string;
  precoCent?: number;
  unidadeVenda?: Partial<SaleUnit>;
  stockDisponivel?: number;
  limiarStockBaixo?: number;
  ingredientesAplicaveis?: boolean;
  ingredientes: string[];
  etiquetas: string[];
  epocaMeses?: number[];
  modoProducao?: string;
  imagens: Photo[];
}
export interface OwnProduct extends ProductInput {
  estadoModeracao?: VisibilityState;
  id: string;
  etag: string;
  estadoPublicacao: keyof typeof publicationLabels;
  reservasLeilao?: { quantidade: number; unidade: string; estado: string }[];
}
export interface Period {
  diaSemana: number;
  inicio: string;
  fim: string;
}
export interface Commercial {
  localLevantamento?: string;
  modalidades: { levantamento: boolean; entrega: boolean };
  taxaEntregaCent?: number;
  concelhosEntregaIds: string[];
  catalogoConcelhosVersao?: string;
  disponibilidade: { fusoHorario: string; levantamento: Period[]; entrega: Period[] };
  metodosPagamento: ('dinheiro' | 'mb_way' | 'transferencia_bancaria')[];
  pagamentoPrivado?: {
    mbWay?: { contacto: string };
    transferenciaBancaria?: { iban: string; titular?: string };
  };
}
export interface Profile {
  estadoModeracao?: VisibilityState;
  id: string;
  etag: string;
  nomePublico: string;
  localidade: string;
  concelho: string;
  descricao: string;
  telefone: string;
  imagem?: Photo;
  comercial: Commercial | null;
  localizacaoPublica?: PublicLocation & { autorizada: true };
  estadoAprovacao: 'pendente' | 'aprovado' | 'rejeitado';
}
function tag(v: unknown) {
  const s = text(v);
  if (!/^"[A-Za-z0-9_-]{43}"$/.test(s)) throw new InvalidResponse();
  return s;
}
function photo(v: unknown): Photo {
  const r = record(v),
    url = text(r.url),
    u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new InvalidResponse();
  return {
    url,
    ...(r.alt === undefined ? {} : { alt: text(r.alt) }),
    ...(r.principal === undefined ? {} : { principal: r.principal === true }),
  };
}
function strings(v: unknown) {
  if (!Array.isArray(v)) throw new InvalidResponse();
  return v.map(text);
}
export function parseOwnProduct(v: unknown): OwnProduct {
  const r = record(v);
  if (
    !Object.hasOwn(publicationLabels, String(r.estadoPublicacao)) ||
    !Array.isArray(r.imagens) ||
    r.imagens.length > 2
  )
    throw new InvalidResponse();
  const result: OwnProduct = {
    id: id(r.id),
    etag: tag(r.etag),
    nome: text(r.nome),
    estadoModeracao: parseVisibility(r.estadoModeracao),
    estadoPublicacao: r.estadoPublicacao as OwnProduct['estadoPublicacao'],
    imagens: r.imagens.map(photo),
    ingredientes: strings(r.ingredientes),
    etiquetas: strings(r.etiquetas),
  };
  for (const key of ['descricao', 'categoriaId', 'modoProducao'] as const)
    if (r[key] !== undefined) result[key] = text(r[key]);
  for (const key of ['precoCent', 'stockDisponivel', 'limiarStockBaixo'] as const)
    if (r[key] !== undefined) result[key] = number(r[key]);
  if (r.ingredientesAplicaveis !== undefined) {
    if (typeof r.ingredientesAplicaveis !== 'boolean') throw new InvalidResponse();
    result.ingredientesAplicaveis = r.ingredientesAplicaveis;
  }
  if (r.epocaMeses !== undefined) {
    if (!Array.isArray(r.epocaMeses)) throw new InvalidResponse();
    result.epocaMeses = r.epocaMeses.map((m) => number(m, 1));
    if (result.epocaMeses.some((m) => m > 12)) throw new InvalidResponse();
  }
  if (r.unidadeVenda !== undefined) {
    const u = record(r.unidadeVenda),
      unit: Partial<SaleUnit> = {};
    if (u.modalidade !== undefined) {
      if (!['peso', 'volume', 'unidade', 'embalagem'].includes(String(u.modalidade)))
        throw new InvalidResponse();
      unit.modalidade = u.modalidade as SaleUnit['modalidade'];
    }
    if (u.unidadeBase !== undefined) {
      if (!['g', 'ml', 'un'].includes(String(u.unidadeBase))) throw new InvalidResponse();
      unit.unidadeBase = u.unidadeBase as SaleUnit['unidadeBase'];
    }
    for (const key of ['quantidadeReferencia', 'quantidadeMinima', 'incrementoCompra'] as const)
      if (u[key] !== undefined) unit[key] = number(u[key], 1);
    if (u.rotulo !== undefined) unit.rotulo = text(u.rotulo);
    if (u.conteudoPorUnidade !== undefined) {
      const c = record(u.conteudoPorUnidade);
      if (!['g', 'ml', 'un'].includes(String(c.unidade))) throw new InvalidResponse();
      unit.conteudoPorUnidade = {
        quantidade: number(c.quantidade, 1),
        unidade: c.unidade as 'g' | 'ml' | 'un',
      };
    }
    result.unidadeVenda = unit;
  }
  if (r.reservasLeilao !== undefined) {
    if (!Array.isArray(r.reservasLeilao)) throw new InvalidResponse();
    result.reservasLeilao = r.reservasLeilao.map((v) => {
      const a = record(v);
      return { quantidade: number(a.quantidade), unidade: text(a.unidade), estado: text(a.estado) };
    });
  }
  return result;
}
export const parseOwnProducts = (v: unknown) => parsePage(v, parseOwnProduct);
export function productInput(p: ProductInput): ProductInput {
  return {
    nome: p.nome,
    descricao: p.descricao,
    categoriaId: p.categoriaId,
    precoCent: p.precoCent,
    unidadeVenda: p.unidadeVenda,
    stockDisponivel: p.stockDisponivel,
    limiarStockBaixo: p.limiarStockBaixo,
    ingredientesAplicaveis: p.ingredientesAplicaveis,
    ingredientes: p.ingredientes,
    etiquetas: p.etiquetas,
    epocaMeses: p.epocaMeses,
    modoProducao: p.modoProducao,
    imagens: p.imagens,
  };
}
export function parseProfile(v: unknown): Profile {
  const r = record(v),
    state = text(r.estadoAprovacao);
  if (!['pendente', 'aprovado', 'rejeitado'].includes(state)) throw new InvalidResponse();
  let comercial: Commercial | null = null;
  if (r.comercial !== null) {
    const c = record(r.comercial),
      modes = record(c.modalidades),
      a = record(c.disponibilidade);
    if (typeof modes.levantamento !== 'boolean' || typeof modes.entrega !== 'boolean')
      throw new InvalidResponse();
    const periods = (v: unknown) => {
      if (!Array.isArray(v)) throw new InvalidResponse();
      return v.map((p) => {
        const r = record(p),
          diaSemana = number(r.diaSemana, 1),
          inicio = text(r.inicio),
          fim = text(r.fim);
        if (diaSemana > 7 || !/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fim))
          throw new InvalidResponse();
        return { diaSemana, inicio, fim };
      });
    };
    const methods = strings(c.metodosPagamento);
    if (!methods.every((m) => ['dinheiro', 'mb_way', 'transferencia_bancaria'].includes(m)))
      throw new InvalidResponse();
    comercial = {
      modalidades: { levantamento: modes.levantamento, entrega: modes.entrega },
      concelhosEntregaIds: strings(c.concelhosEntregaIds),
      disponibilidade: {
        fusoHorario: text(a.fusoHorario),
        levantamento: periods(a.levantamento),
        entrega: periods(a.entrega),
      },
      metodosPagamento: methods as Commercial['metodosPagamento'],
    };
    if (c.localLevantamento !== undefined) comercial.localLevantamento = text(c.localLevantamento);
    if (c.taxaEntregaCent !== undefined) comercial.taxaEntregaCent = number(c.taxaEntregaCent);
    if (c.catalogoConcelhosVersao !== undefined)
      comercial.catalogoConcelhosVersao = text(c.catalogoConcelhosVersao);
    if (c.pagamentoPrivado !== undefined) {
      const b = record(c.pagamentoPrivado);
      comercial.pagamentoPrivado = {};
      if (b.mbWay !== undefined)
        comercial.pagamentoPrivado.mbWay = { contacto: text(record(b.mbWay).contacto) };
      if (b.transferenciaBancaria !== undefined) {
        const t = record(b.transferenciaBancaria);
        comercial.pagamentoPrivado.transferenciaBancaria = {
          iban: text(t.iban),
          ...(t.titular === undefined ? {} : { titular: text(t.titular) }),
        };
      }
    }
  }
  return {
    id: id(r.id),
    etag: tag(r.etag),
    estadoModeracao: parseVisibility(r.estadoModeracao),
    estadoAprovacao: state as Profile['estadoAprovacao'],
    nomePublico: text(r.nomePublico),
    localidade: text(r.localidade),
    concelho: text(r.concelho),
    descricao: text(r.descricao),
    telefone: text(r.telefone),
    comercial,
    ...(r.localizacaoPublica === undefined
      ? {}
      : {
          localizacaoPublica: {
            ...parsePublicLocation(r.localizacaoPublica),
            autorizada:
              record(r.localizacaoPublica).autorizada === true
                ? (true as const)
                : (() => {
                    throw new InvalidResponse();
                  })(),
          },
        }),
    ...(r.imagem === undefined ? {} : { imagem: photo(r.imagem) }),
  };
}
export function stockState(p: ProductInput) {
  return p.stockDisponivel === undefined
    ? 'Por definir'
    : p.stockDisponivel === 0
      ? 'Indisponível'
      : p.limiarStockBaixo !== undefined && p.stockDisponivel <= p.limiarStockBaixo
        ? 'Stock reduzido'
        : 'Disponível';
}
export function managementError(e: unknown) {
  const s = e && typeof e === 'object' && 'status' in e ? e.status : undefined;
  return s === 412 || s === 409
    ? 'Os dados mudaram ou a operação não está disponível. Consulta o estado atual antes de repetir.'
    : s === 400 || s === 415
      ? 'Revê os campos, as condições de publicação e o formato da fotografia.'
      : s === 403
        ? 'A conta já não tem autorização para esta gestão.'
        : s === 413
          ? 'A fotografia excede o limite de 5 MiB.'
          : 'Não foi possível confirmar o resultado. Consulta os dados antes de repetir.';
}
