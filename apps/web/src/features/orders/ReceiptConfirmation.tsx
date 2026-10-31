import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { parseReceiptOrder, type ReceiptOrder } from './receipt-contract';
export function ReceiptConfirmation({
  order,
  confirmed,
  refresh,
  onIntent,
}: {
  onIntent: (active: boolean) => void;
  order: ReceiptOrder;
  confirmed: (order: ReceiptOrder) => void;
  refresh: () => void;
}) {
  const { request } = useAuth(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    pending = useRef<AbortController | undefined>(undefined),
    feedback = useRef<HTMLDivElement>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  if (!order.podeConfirmarRececao || !order.etag || order.estado !== 'pronta') return null;
  return (
    <section
      className="receipt-confirmation producer-live-actions"
      aria-label="Confirmar receção da encomenda"
    >
      <h2>Já está à tua mesa?</h2>
      <p>
        Confirma apenas depois de receberes ou levantares todos os produtos desta encomenda. A
        confirmação conclui a encomenda e permite avaliar a compra. Não confirma nem altera o
        pagamento.
      </p>
      {error && (
        <div tabIndex={-1} ref={feedback}>
          <p role="alert">{error}</p>
          <Button onClick={refresh}>Consultar estado antes de repetir</Button>
        </div>
      )}
      <Button disabled={busy || !!error} onClick={() => setOpen(true)}>
        Confirmar receção
      </Button>
      {open && (
        <ConfirmationDialog
          open
          busy={busy}
          title="Confirmar que recebeste a encomenda?"
          description="Declaro que recebi ou levantei todos os produtos. A encomenda ficará concluída; o pagamento mantém o seu estado."
          confirmLabel="Sim, recebi a encomenda"
          onClose={() => setOpen(false)}
          onConfirm={() => {
            if (pending.current || error) return;
            const controller = new AbortController();
            pending.current = controller;
            setBusy(true);
            onIntent(true);
            void request(
              '/orders/' + order.id + '/receipt',
              parseReceiptOrder,
              { method: 'PATCH', body: { confirmarRececao: true }, ifMatch: order.etag },
              controller.signal,
            )
              .then((result) => {
                if (!controller.signal.aborted) {
                  if (
                    result.id !== order.id ||
                    result.estado !== 'concluida' ||
                    !result.rececao?.confirmadaEm
                  )
                    throw new ApiFailure('invalid');
                  confirmed(result);
                }
              })
              .catch((e) => {
                if (!controller.signal.aborted) {
                  setOpen(false);
                  onIntent(false);
                  setError(
                    e instanceof ApiFailure && [409, 412].includes(e.status ?? 0)
                      ? 'A encomenda mudou. Consulta o estado atualizado antes de confirmar.'
                      : 'Não foi possível confirmar a resposta. Consulta a encomenda antes de repetir.',
                  );
                }
              })
              .finally(() => {
                if (!controller.signal.aborted) {
                  pending.current = undefined;
                  setBusy(false);
                }
              });
          }}
        />
      )}
    </section>
  );
}
