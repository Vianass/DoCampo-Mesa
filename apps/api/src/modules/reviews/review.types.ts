import type { Types } from 'mongoose';
export interface ReviewDecision {
  administrador: Types.ObjectId;
  ocorridoEm: Date;
  anterior: 'publicada' | 'oculta';
  estado: 'publicada' | 'oculta';
  motivo: string;
  versao: number;
}
export interface ReviewRecord {
  _id: Types.ObjectId;
  autor: Types.ObjectId;
  encomenda: Types.ObjectId;
  alvoTipo: 'produto' | 'produtor';
  produto?: Types.ObjectId;
  produtor?: Types.ObjectId;
  vendedor: Types.ObjectId;
  perfilProdutor: Types.ObjectId;
  alvoNome: string;
  classificacao: number;
  comentario: string;
  estado: 'publicada' | 'oculta';
  versao: number;
  historico: ReviewDecision[];
  createdAt: Date;
  updatedAt: Date;
}
