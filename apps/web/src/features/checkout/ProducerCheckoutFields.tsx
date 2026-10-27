import { FormField } from '../../components/FormField';
import { PriceDisplay } from '../../components/PriceDisplay';
import type { PreparedProducer } from './contracts';
import { paymentLabels } from './contracts';
import { declaredWindows, defaultModality } from './model';
function today(zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
function suggestedDate(producer: PreparedProducer, mode: 'levantamento' | 'entrega') {
  const first = today(producer.comercial.disponibilidade.fusoHorario);
  for (let n = 0; n < 14; n++) {
    const date = new Date(first + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + n);
    const value = date.toISOString().slice(0, 10);
    if (
      declaredWindows(
        value,
        producer.comercial.disponibilidade[mode],
        producer.comercial.disponibilidade.fusoHorario,
      ).length
    )
      return value;
  }
  return first;
}
export function ProducerCheckoutFields({
  producer,
  draft,
  onChange,
}: {
  producer: PreparedProducer;
  draft: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const c = producer.comercial,
    zone = c.disponibilidade.fusoHorario,
    prefix = producer.produtorContaId;
  const initial = defaultModality(producer);
  const mode: 'levantamento' | 'entrega' =
    draft[prefix + '.modalidade'] === 'entrega' ? 'entrega' : initial;
  const date = draft[prefix + '.data'] ?? suggestedDate(producer, mode),
    window = draft[prefix + '.janela'] ?? '';
  const windows = declaredWindows(date, c.disponibilidade[mode], zone);
  const any = (c.modalidades.levantamento && !!c.localLevantamento) || c.modalidades.entrega;
  return (
    <fieldset className="checkout-producer" aria-describedby={prefix + '-note'}>
      <legend>{producer.nome}</legend>
      <p id={prefix + '-note'}>
        Escolhe como receber estes produtos. Os horários correspondem à disponibilidade declarada
        pelo produtor.
      </p>
      {!any ? (
        <p role="alert">
          Este produtor ainda não tem condições de receção disponíveis para esta compra.
        </p>
      ) : (
        <>
          <div className="checkout-fields">
            <div className="form-field">
              <label className="form-label" htmlFor={prefix + '-mode'}>
                Como receber · {producer.nome}
              </label>
              <select
                className="form-select"
                id={prefix + '-mode'}
                name={prefix + '.modalidade'}
                value={mode}
                onChange={(e) => {
                  const value = e.target.value as typeof mode;
                  onChange({
                    [prefix + '.modalidade']: value,
                    [prefix + '.data']: suggestedDate(producer, value),
                    [prefix + '.janela']: '',
                  });
                }}
              >
                {c.modalidades.levantamento && c.localLevantamento && (
                  <option value="levantamento">Levantamento</option>
                )}
                {c.modalidades.entrega && <option value="entrega">Entrega</option>}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor={prefix + '-payment'}>
                Pagamento · {producer.nome}
              </label>
              <select
                className="form-select"
                id={prefix + '-payment'}
                name={prefix + '.metodoPagamento'}
                value={draft[prefix + '.metodoPagamento'] ?? ''}
                onChange={(e) => onChange({ [prefix + '.metodoPagamento']: e.target.value })}
                required
              >
                <option value="">Escolher método</option>
                {c.metodosPagamento.map((m) => (
                  <option value={m} key={m}>
                    {paymentLabels[m]}
                  </option>
                ))}
              </select>
            </div>
            <FormField
              label={'Data · ' + producer.nome}
              name={prefix + '.data'}
              type="date"
              value={date}
              min={today(zone)}
              onChange={(e) => {
                onChange({ [prefix + '.data']: e.target.value, [prefix + '.janela']: '' });
              }}
              required
              hint={'Hora local do produtor: ' + zone}
            />
            <div className="form-field">
              <label className="form-label" htmlFor={prefix + '-window'}>
                Janela horária · {producer.nome}
              </label>
              <select
                className="form-select"
                id={prefix + '-window'}
                name={prefix + '.janela'}
                value={window}
                onChange={(e) =>
                  onChange({ [prefix + '.janela']: e.target.value, [prefix + '.data']: date })
                }
                required
              >
                <option value="">Escolher horário</option>
                {windows.map((w, i) => (
                  <option value={i} key={w.label}>
                    {w.label}
                  </option>
                ))}
              </select>
              {!windows.length && (
                <p className="form-field__hint">
                  Sem janelas declaradas para esta data. Escolhe outro dia.
                </p>
              )}
            </div>
          </div>
          {mode === 'levantamento' ? (
            <p className="checkout-condition">
              <strong>Local de levantamento</strong>
              <br />
              {c.localLevantamento}
              <br />
              Sem taxa de entrega.
            </p>
          ) : (
            <>
              <p className="checkout-condition">
                Taxa de entrega deste produtor:{' '}
                <PriceDisplay amountCents={c.taxaEntregaCent ?? 0} />
              </p>
              <div className="checkout-fields">
                <div className="form-field">
                  <label className="form-label" htmlFor={prefix + '-municipality'}>
                    Concelho de entrega · {producer.nome}
                  </label>
                  <select
                    className="form-select"
                    id={prefix + '-municipality'}
                    name={prefix + '.concelhoId'}
                    value={draft[prefix + '.concelhoId'] ?? ''}
                    onChange={(e) => onChange({ [prefix + '.concelhoId']: e.target.value })}
                    required
                  >
                    <option value="">Escolher concelho</option>
                    {c.concelhosEntregaIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField
                  label={'Contacto de entrega · ' + producer.nome}
                  name={prefix + '.contacto'}
                  value={draft[prefix + '.contacto'] ?? ''}
                  onChange={(e) => onChange({ [prefix + '.contacto']: e.target.value })}
                  autoComplete="tel"
                  maxLength={4096}
                  required
                />
                <FormField
                  label={'Morada de entrega · ' + producer.nome}
                  name={prefix + '.morada'}
                  value={draft[prefix + '.morada'] ?? ''}
                  onChange={(e) => onChange({ [prefix + '.morada']: e.target.value })}
                  autoComplete="street-address"
                  maxLength={4096}
                  required
                />
              </div>
            </>
          )}
          <p className="checkout-note">
            O método escolhido fica registado como por pagar. Não é efetuado qualquer pagamento
            online nem reserva de horário.
          </p>
        </>
      )}
    </fieldset>
  );
}
