import { z } from 'zod';
import { idempotencyKey } from '../modules/auctions/auction.validation.js';
import type { AuctionService } from '../modules/auctions/auction.service.js';
import type { AuctionSnapshot } from '../modules/auctions/auction.snapshot.js';
import type { InvalidField } from '../http/api-error.js';

export const roomRequest = z.strictObject({
  leilaoId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .transform((s) => s.toLowerCase()),
});
// Preços, incremento e elegibilidade continuam a ser validados apenas pelo serviço da Fase 6A.
export const bidRequest = roomRequest.extend({ requestId: idempotencyKey, valorCent: z.unknown() });
export const handshakeAuth = z.strictObject({ token: z.string().min(1).max(4096) });
export interface RealtimeError {
  status: number;
  codigo: string;
  mensagem: string;
  campos?: InvalidField[];
  repetirEmSegundos?: number;
  resultadoIncerto?: true;
}
export type Reply<T> = { ok: true; data: T } | { ok: false; erro: RealtimeError };
export type Ack<T> = (reply: Reply<T>) => void;
export type RoomRequest = z.infer<typeof roomRequest>;
export interface BidRequest extends RoomRequest {
  requestId: string;
  valorCent: number;
}
export interface BidAccepted {
  requestId: string;
  origem: 'nova' | 'replay';
  licitacao: Awaited<ReturnType<AuctionService['bid']>>['body']['licitacao'];
  estado: AuctionSnapshot;
}
export const adminWatchRequest = z.strictObject({});
export interface ClientEvents {
  'admin:auctions:watch': (body: Record<string, never>, ack: Ack<{ subscrito: true }>) => void;
  'auction:join': (body: RoomRequest, ack: Ack<AuctionSnapshot>) => void;
  'auction:leave': (body: RoomRequest, ack: Ack<RoomRequest>) => void;
  'auction:state': (body: RoomRequest, ack: Ack<AuctionSnapshot>) => void;
  'auction:bid': (body: BidRequest, ack: Ack<BidAccepted>) => void;
}
export interface ServerEvents {
  'admin:auctions:changed': (hint: { consultar: true }) => void;
  'auction:updated': (state: AuctionSnapshot) => void;
  'auction:ended': (state: AuctionSnapshot) => void;
  'auction:presence': (presence: { leilaoId: string; ligacoes: number }) => void;
  'auction:bid:accepted': (receipt: BidAccepted) => void;
  'auction:bid:rejected': (error: {
    leilaoId?: string;
    requestId?: string;
    erro: RealtimeError;
  }) => void;
  'auction:bid:uncertain': (error: {
    leilaoId?: string;
    requestId?: string;
    erro: RealtimeError;
  }) => void;
  'auction:error': (error: RealtimeError) => void;
}
