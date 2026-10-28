import type { Types } from 'mongoose';
import type { OrderSaleUnit } from '../orders/order.types.js';
export const auctionStates = ['agendado', 'ativo', 'terminado', 'cancelado'] as const;
export type AuctionState = (typeof auctionStates)[number];
export interface AuctionEvent {
  tipo: string;
  ocorridoEm: Date;
  origem: 'produtor' | 'sistema';
  ator?: Types.ObjectId;
}
export interface AuctionRecord {
  _id: Types.ObjectId;
  produtor: Types.ObjectId;
  produto: Types.ObjectId;
  produtorPublico: { perfilId: Types.ObjectId; nome: string };
  titulo: string;
  descricao: string;
  lote: { nome: string; quantidade: number; unidadeVenda: OrderSaleUnit };
  precoBaseCent: number;
  incrementoCent: number;
  iniciaEm: Date;
  terminaEm: Date;
  estado: AuctionState;
  licitacaoAtual: {
    valorCent: number;
    comprador: Types.ObjectId | null;
    bidId: Types.ObjectId | null;
  };
  sequencia: number;
  versao: number;
  reserva: {
    estado: 'reservada' | 'afeta_vencedor' | 'libertada' | 'libertacao_pendente';
    reposta: number;
    pendente: number;
  };
  resultado?: {
    tipo: 'sem_licitacoes' | 'vencedor';
    comprador: Types.ObjectId | null;
    bidId: Types.ObjectId | null;
    valorCent: number | null;
  };
  encerradoEm?: Date;
  criacao: { chave: string; hash: string };
  historico: AuctionEvent[];
  createdAt: Date;
  updatedAt: Date;
}
