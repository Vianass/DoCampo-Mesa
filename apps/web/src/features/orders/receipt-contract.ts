import { InvalidResponse } from '../api/catalog-contract';
import { parseOrderDetail, type OwnOrder } from '../checkout/contracts';
import type { JsonResponseMetadata } from '../api/client';
import { record, number } from '../auctions/contracts';
export interface ReceiptOrder extends OwnOrder {
  versao?: number;
  etag?: string;
  podeConfirmarRececao?: boolean;
  rececao?: { confirmadaEm: string | null; concluidaEm: string | null };
}
export function parseReceiptOrder(v: unknown, m: JsonResponseMetadata): ReceiptOrder {
  const result: ReceiptOrder = parseOrderDetail(v),
    r = record(v);
  // As fixtures antigas conservam o contrato anterior; só metadados confirmados habilitam escrita.
  if (r.versao === undefined && r.podeConfirmarRececao === undefined) return result;
  const reception = record(r.rececao);
  const date = (v: unknown) => {
    if (v === null) return null;
    if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new InvalidResponse();
    return v;
  };
  if (
    !m.etag ||
    !/^"[A-Za-z0-9_-]{43}"$/.test(m.etag) ||
    typeof r.podeConfirmarRececao !== 'boolean' ||
    r.podeConfirmarRececao !== (result.estado === 'pronta')
  )
    throw new InvalidResponse();
  return {
    ...result,
    versao: number(r.versao),
    etag: m.etag,
    podeConfirmarRececao: r.podeConfirmarRececao,
    rececao: {
      confirmadaEm: date(reception.confirmadaEm),
      concluidaEm: date(reception.concluidaEm),
    },
  };
}
