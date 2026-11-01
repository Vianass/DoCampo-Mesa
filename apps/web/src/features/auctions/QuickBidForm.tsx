import { useState } from 'react';
import { Button } from '../../components/Button';
import { PriceDisplay } from '../../components/PriceDisplay';
import { cents, euros, nextMinimum } from './model';
import { quickBidIncrements, quickBidValue, type QuickBidIncrement } from './quick-bids';

interface Draft {
  text: string;
  receiptId?: string;
  basis?: { current: number; increment: number };
  delta?: QuickBidIncrement;
  cancelled?: boolean;
}
export function QuickBidForm({
  current,
  increment,
  active,
  synced,
  busy,
  pending,
  receiptId,
  submit,
  recover,
}: {
  current: number;
  increment: number;
  active: boolean;
  synced: boolean;
  busy?: boolean;
  pending: boolean;
  receiptId?: string;
  submit: (value: number) => void | Promise<void>;
  recover: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ text: '', receiptId });
  const [validation, setValidation] = useState('');
  // Um recibo confirmado termina a preparação, sem recriar o campo nem perder o foco.
  if (draft.receiptId !== receiptId) {
    setDraft({ text: '', receiptId });
    setValidation('');
  }
  const min = nextMinimum(current, increment);
  const blocked = !active || !synced || !!busy || pending;
  const value = cents(draft.text || (min !== undefined ? euros(min) : ''));
  const stale =
    !!draft.text &&
    !!draft.basis &&
    (draft.basis.current !== current || draft.basis.increment !== increment);
  function prepare(text: string, delta?: QuickBidIncrement) {
    if (blocked) return;
    setDraft({ text, delta, receiptId, basis: { current, increment } });
    setValidation('');
  }
  return (
    <form
      className="auction-bid-form"
      aria-label="Apresentar oferta"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked || stale || draft.cancelled) return;
        if (value === undefined || min === undefined || value < min) {
          setValidation('Indica um valor igual ou superior à próxima oferta mínima.');
          return;
        }
        setValidation('');
        void submit(value);
      }}
    >
      <fieldset
        className="auction-quick-bids"
        disabled={blocked || min === undefined}
        aria-describedby="auction-quick-hint"
      >
        <legend>Preparar uma oferta</legend>
        <p id="auction-quick-hint">
          Soma ao valor atual confirmado. Escolher um atalho não envia a oferta. Aumentos abaixo do
          incremento mínimo ficam indisponíveis.
        </p>
        <div className="auction-quick-options">
          {quickBidIncrements.map((delta) => {
            const result = quickBidValue(current, increment, delta);
            return (
              <Button
                key={delta}
                type="button"
                variant="secondary"
                className="auction-quick-button"
                aria-label={'+' + delta / 100 + ' €'}
                aria-pressed={!stale && draft.delta === delta}
                aria-describedby={'auction-quick-result-' + delta}
                disabled={result === undefined}
                onClick={() => {
                  if (result !== undefined) prepare(euros(result), delta);
                }}
              >
                <strong>+{delta / 100} €</strong>
                <span id={'auction-quick-result-' + delta}>
                  {result === undefined ? (
                    delta < increment ? (
                      'Abaixo do mínimo'
                    ) : (
                      'Limite atingido'
                    )
                  ) : (
                    <PriceDisplay amountCents={result} />
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      </fieldset>
      <label htmlFor="auction-bid-amount">A tua oferta pelo lote (€)</label>
      <input
        id="auction-bid-amount"
        className="form-control"
        inputMode="decimal"
        autoComplete="off"
        value={draft.text}
        placeholder={min !== undefined ? euros(min) : '—'}
        disabled={blocked}
        onChange={(e) => prepare(e.target.value)}
        aria-invalid={validation ? true : undefined}
        aria-describedby="auction-minimum auction-bid-error"
      />
      <p id="auction-minimum">
        Próxima oferta mínima:{' '}
        {min !== undefined ? <PriceDisplay amountCents={min} /> : 'Limite de valor atingido'}
      </p>
      <p className="auction-prepared-value" role="status" aria-live="polite">
        {draft.cancelled ? (
          'Preparação cancelada. Escolhe um atalho ou escreve um valor.'
        ) : (
          <>
            Valor a confirmar:{' '}
            {value !== undefined ? <PriceDisplay amountCents={value} /> : 'indica um valor válido.'}
            {stale && (
              <span>
                O valor atual ou o incremento mudou. Revê a oferta preparada; o seu valor não foi
                aumentado.
              </span>
            )}
          </>
        )}
      </p>
      <p id="auction-bid-error" role={validation ? 'alert' : undefined}>
        {validation}
      </p>
      <Button type="submit" disabled={blocked || stale || draft.cancelled || min === undefined}>
        {busy ? 'A confirmar oferta…' : 'Confirmar oferta'}
      </Button>
      {stale && (
        <Button
          type="button"
          variant="secondary"
          disabled={blocked || value === undefined || min === undefined || value < min}
          onClick={() => prepare(draft.text)}
        >
          Manter este valor
        </Button>
      )}
      {!!draft.text && (
        <Button
          type="button"
          variant="text"
          disabled={blocked}
          onClick={() => {
            setDraft({ text: '', receiptId, cancelled: true });
            setValidation('');
          }}
        >
          Cancelar preparação
        </Button>
      )}
      {pending && (
        <Button type="button" variant="secondary" disabled={!synced || busy} onClick={recover}>
          Recuperar resultado da oferta
        </Button>
      )}
    </form>
  );
}
