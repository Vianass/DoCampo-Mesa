import type { Types } from 'mongoose';

export const visibilityStates = ['visivel', 'oculta'] as const;
export type VisibilityState = (typeof visibilityStates)[number];
export interface ModerationDecision<S extends string = VisibilityState> {
  administrador: Types.ObjectId;
  ocorridoEm: Date;
  anterior: S;
  estado: S;
  motivo: string;
  versao: number;
}
/** Independente da publicação comercial, aprovação e estado da conta. Ausência legada = visível. */
export interface ContentVisibility {
  estado: VisibilityState;
  versao: number;
  historico: ModerationDecision[];
}
export type ReportTarget = 'produto' | 'produtor' | 'avaliacao';
export type ReportState = 'pendente' | 'resolvida' | 'rejeitada';
export interface ContentEvidence {
  nome: string;
  descricao: string;
  imagens: { url: string; alt?: string }[];
  ingredientes?: string[];
  etiquetas?: string[];
  modoProducao?: string;
  classificacao?: number;
}
export interface ContentReport {
  _id: Types.ObjectId;
  autor: Types.ObjectId;
  alvoTipo: ReportTarget;
  alvoId: Types.ObjectId;
  motivo: string;
  evidencia: ContentEvidence;
  estado: ReportState;
  versao: number;
  historico: ModerationDecision<ReportState>[];
  conteudoNaDecisao?: { disponivel: boolean; estado?: VisibilityState; versao?: number };
  createdAt: Date;
  updatedAt: Date;
}
