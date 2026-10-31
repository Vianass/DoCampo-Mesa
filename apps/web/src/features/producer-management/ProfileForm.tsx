import { useState } from 'react';
import { LocationFields } from '../discovery/LocationFields';
import { useLocationDraft } from '../discovery/useLocationDraft';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { cents, euros } from '../auctions/model';
import { applicationFields } from '../producer-application/model';
import { parseProfile, type Profile, type Commercial, type Period } from './contracts';
import { useManagementMutation } from './useManagement';
import { ManagedPhoto, MutationFeedback } from './ManagementComponents';
const blankCommercial = (): Commercial => ({
  modalidades: { levantamento: true, entrega: false },
  concelhosEntregaIds: [],
  disponibilidade: { fusoHorario: 'Europe/Lisbon', levantamento: [], entrega: [] },
  metodosPagamento: ['dinheiro'],
});
const days = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];
function Periods({
  label,
  periods,
  change,
}: {
  label: string;
  periods: Period[];
  change: (v: Period[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {periods.map((p, index) => (
        <div className="management-period" key={index}>
          <label>
            Dia {index + 1}
            <select
              aria-label={'Dia ' + (index + 1)}
              className="form-select"
              value={p.diaSemana}
              onChange={(e) =>
                change(
                  periods.map((v, i) =>
                    i === index ? { ...v, diaSemana: Number(e.target.value) } : v,
                  ),
                )
              }
            >
              {days.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label={'Início ' + label + ' ' + (index + 1)}
            type="time"
            required
            value={p.inicio}
            onChange={(e) =>
              change(periods.map((v, i) => (i === index ? { ...v, inicio: e.target.value } : v)))
            }
          />
          <FormField
            label={'Fim ' + label + ' ' + (index + 1)}
            type="time"
            required
            value={p.fim}
            onChange={(e) =>
              change(periods.map((v, i) => (i === index ? { ...v, fim: e.target.value } : v)))
            }
          />
          <Button variant="text" onClick={() => change(periods.filter((_, i) => i !== index))}>
            Retirar período {index + 1} de {label}
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={periods.length >= 28}
        onClick={() => change([...periods, { diaSemana: 1, inicio: '', fim: '' }])}
      >
        Adicionar período de {label}
      </Button>
    </fieldset>
  );
}
export function ProfileForm({
  profile,
  refresh,
  saved,
}: {
  profile: Profile;
  refresh: () => void;
  saved: (p: Profile) => void;
}) {
  const initial = {
    nomePublico: profile.nomePublico,
    localidade: profile.localidade,
    concelho: profile.concelho,
    descricao: profile.descricao,
    telefone: profile.telefone,
    imagem: profile.imagem,
    comercial: profile.comercial,
  };
  const [draft, setDraft] = useState(initial),
    [enabled, setEnabled] = useState(!!profile.comercial),
    [commercial, setCommercial] = useState(profile.comercial ?? blankCommercial()),
    [fee, setFee] = useState(
      profile.comercial?.taxaEntregaCent === undefined
        ? ''
        : euros(profile.comercial.taxaEntregaCent),
    ),
    [validation, setValidation] = useState('');
  const location = useLocationDraft(profile.localizacaoPublica);
  const mutation = useManagementMutation(),
    dirty =
      location.dirty ||
      JSON.stringify(draft) !== JSON.stringify(initial) ||
      enabled !== !!profile.comercial ||
      JSON.stringify(commercial) !== JSON.stringify(profile.comercial ?? blankCommercial()) ||
      fee !==
        (profile.comercial?.taxaEntregaCent === undefined
          ? ''
          : euros(profile.comercial.taxaEntregaCent));
  function set<K extends keyof Commercial>(key: K, value: Commercial[K]) {
    setCommercial((c) => ({ ...c, [key]: value }));
  }
  return (
    <>
      <p>
        Estatuto:{' '}
        {profile.estadoAprovacao === 'aprovado' ? 'Produtor aprovado' : 'Candidatura em análise'}.
        Este formulário não altera a decisão administrativa.
      </p>
      <p>
        <Link to={'/produtores/' + profile.id}>Consultar o perfil público ↗</Link>
      </p>
      <MutationFeedback error={mutation.error} retry={refresh} />
      {validation && <p role="alert">{validation}</p>}
      <form
        aria-label="Perfil e condições da loja"
        onSubmit={(e) => {
          e.preventDefault();
          const value = fee === '0' || fee === '0,00' || fee === '0.00' ? 0 : cents(fee);
          if (enabled && commercial.modalidades.entrega && value === undefined) {
            setValidation('Indica a taxa de entrega, que pode ser zero.');
            return;
          }
          if (
            enabled &&
            (['levantamento', 'entrega'] as const).some(
              (m) => commercial.modalidades[m] && commercial.disponibilidade[m].length === 0,
            )
          ) {
            setValidation('Define pelo menos um período para cada modalidade ativa.');
            return;
          }
          if (location.enabled && !location.valid) {
            setValidation('Confirma o ponto público e a autorização para o publicar.');
            return;
          }
          setValidation('');
          void mutation.run(
            '/me/producer',
            parseProfile,
            {
              method: 'PUT',
              ifMatch: profile.etag,
              body: {
                ...draft,
                localizacaoPublica: location.value,
                comercial: enabled ? { ...commercial, taxaEntregaCent: value } : null,
              },
            },
            saved,
          );
        }}
      >
        <fieldset disabled={mutation.busy || mutation.blocked}>
          <legend>Apresentar a tua origem</legend>
          <div className="management-grid">
            {Object.entries(applicationFields)
              .filter(([key]) => key !== 'descricao')
              .map(([key, f]) => (
                <FormField
                  key={key}
                  label={f.label}
                  required
                  maxLength={f.maximum}
                  value={draft[key as 'nomePublico' | 'localidade' | 'concelho' | 'telefone']}
                  onChange={(e) => setDraft((v) => ({ ...v, [key]: e.target.value }))}
                />
              ))}
          </div>
          <label className="form-field">
            Descrição da atividade
            <textarea
              className="form-control"
              required
              maxLength={5000}
              rows={5}
              value={draft.descricao}
              onChange={(e) => setDraft((v) => ({ ...v, descricao: e.target.value }))}
            />
          </label>
          <p>
            Nome público, localidade, concelho, descrição e fotografia aparecem no mercado quando o
            perfil está aprovado. O telefone e os dados privados de pagamento não fazem parte do
            perfil público.
          </p>
          <label className="management-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Configurar condições de venda
          </label>
          <p>
            As condições são guardadas nesta loja e copiadas para cada compra. Desativá-las impede
            novas compras até voltares a configurá-las; encomendas anteriores não mudam.
          </p>
          {enabled && (
            <fieldset>
              <legend>Levantamento, entrega e disponibilidade</legend>
              <div className="management-checks">
                {(['levantamento', 'entrega'] as const).map((m) => (
                  <label className="management-check" key={m}>
                    <input
                      type="checkbox"
                      checked={commercial.modalidades[m]}
                      onChange={(e) =>
                        set('modalidades', { ...commercial.modalidades, [m]: e.target.checked })
                      }
                    />
                    {m === 'levantamento' ? 'Permitir levantamento' : 'Permitir entrega'}
                  </label>
                ))}
              </div>
              {commercial.modalidades.levantamento && (
                <FormField
                  label="Local de levantamento"
                  required
                  maxLength={4096}
                  value={commercial.localLevantamento ?? ''}
                  onChange={(e) => set('localLevantamento', e.target.value || undefined)}
                  hint="Partilhado com o comprador na encomenda, sem o publicar automaticamente no perfil."
                />
              )}
              {commercial.modalidades.entrega && (
                <>
                  <FormField
                    label="Taxa de entrega (€)"
                    inputMode="decimal"
                    required
                    pattern="[0-9]+([,.][0-9]{1,2})?"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    hint="Taxa fixa por encomenda deste produtor; pode ser zero."
                  />
                  <label className="form-field">
                    Concelhos de entrega (um código por linha)
                    <textarea
                      className="form-control"
                      required
                      rows={3}
                      value={commercial.concelhosEntregaIds.join('\n')}
                      onChange={(e) => set('concelhosEntregaIds', e.target.value.split('\n'))}
                      onBlur={() =>
                        set(
                          'concelhosEntregaIds',
                          commercial.concelhosEntregaIds.map((v) => v.trim()).filter(Boolean),
                        )
                      }
                    />
                  </label>
                  <p>
                    Conserva os códigos estáveis usados nas condições da loja. O catálogo nacional
                    de concelhos ainda não está integrado.
                  </p>
                </>
              )}
              <FormField
                label="Fuso horário da disponibilidade"
                required
                maxLength={100}
                value={commercial.disponibilidade.fusoHorario}
                onChange={(e) =>
                  set('disponibilidade', {
                    ...commercial.disponibilidade,
                    fusoHorario: e.target.value,
                  })
                }
              />
              {(['levantamento', 'entrega'] as const)
                .filter((m) => commercial.modalidades[m])
                .map((m) => (
                  <Periods
                    key={m}
                    label={m}
                    periods={commercial.disponibilidade[m]}
                    change={(v) =>
                      set('disponibilidade', { ...commercial.disponibilidade, [m]: v })
                    }
                  />
                ))}
              <fieldset>
                <legend>Métodos de pagamento direto</legend>
                {(
                  [
                    ['dinheiro', 'Dinheiro'],
                    ['mb_way', 'MB WAY'],
                    ['transferencia_bancaria', 'Transferência bancária'],
                  ] as const
                ).map(([method, label]) => (
                  <label className="management-check" key={method}>
                    <input
                      type="checkbox"
                      checked={commercial.metodosPagamento.includes(method)}
                      onChange={(e) =>
                        set(
                          'metodosPagamento',
                          e.target.checked
                            ? [...commercial.metodosPagamento, method]
                            : commercial.metodosPagamento.filter((m) => m !== method),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {commercial.metodosPagamento.includes('mb_way') && (
                <FormField
                  label="Contacto privado MB WAY (opcional)"
                  maxLength={64}
                  value={commercial.pagamentoPrivado?.mbWay?.contacto ?? ''}
                  onChange={(e) =>
                    set('pagamentoPrivado', {
                      ...commercial.pagamentoPrivado,
                      mbWay: e.target.value ? { contacto: e.target.value } : undefined,
                    })
                  }
                />
              )}
              {commercial.metodosPagamento.includes('transferencia_bancaria') && (
                <>
                  <FormField
                    label="IBAN privado (opcional)"
                    maxLength={50}
                    value={commercial.pagamentoPrivado?.transferenciaBancaria?.iban ?? ''}
                    onChange={(e) =>
                      set('pagamentoPrivado', {
                        ...commercial.pagamentoPrivado,
                        transferenciaBancaria: e.target.value
                          ? {
                              ...commercial.pagamentoPrivado?.transferenciaBancaria,
                              iban: e.target.value,
                            }
                          : undefined,
                      })
                    }
                  />
                  <FormField
                    label="Titular da conta (opcional)"
                    maxLength={160}
                    value={commercial.pagamentoPrivado?.transferenciaBancaria?.titular ?? ''}
                    onChange={(e) => {
                      const bank = commercial.pagamentoPrivado?.transferenciaBancaria;
                      if (bank)
                        set('pagamentoPrivado', {
                          ...commercial.pagamentoPrivado,
                          transferenciaBancaria: { ...bank, titular: e.target.value || undefined },
                        });
                    }}
                  />
                </>
              )}
              <p>
                Não há cobrança, transferência ou confirmação fictícia de pagamento por este
                formulário.
              </p>
            </fieldset>
          )}
          <LocationFields location={location} />
          <Button type="submit" disabled={mutation.busy || mutation.blocked}>
            {mutation.busy ? 'A guardar…' : 'Guardar perfil e condições'}
          </Button>
        </fieldset>
      </form>
      <section className="management-photos">
        <h2>Fotografia do produtor</h2>
        {profile.imagem && (
          <>
            <ManagedPhoto photo={profile.imagem} />
            <FormField
              label="Texto alternativo da fotografia do produtor"
              maxLength={500}
              value={draft.imagem?.alt ?? ''}
              onChange={(e) =>
                setDraft((v) => ({
                  ...v,
                  imagem: v.imagem ? { ...v.imagem, alt: e.target.value || undefined } : undefined,
                }))
              }
            />
            <Button variant="text" onClick={() => setDraft((v) => ({ ...v, imagem: undefined }))}>
              Retirar fotografia do perfil
            </Button>
          </>
        )}
        <p>
          JPEG, PNG ou WebP, até 5 MiB, sem animação. A fotografia só muda depois da confirmação do
          serviço.
        </p>
        {dirty && <p>Guarda as alterações antes de enviar a fotografia.</p>}
        <label className="form-field">
          {profile.imagem
            ? 'Substituir fotografia do produtor'
            : 'Adicionar fotografia do produtor'}
          <input
            className="form-control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={dirty || mutation.busy || mutation.blocked}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void mutation.run(
                  '/me/producer/image',
                  parseProfile,
                  { method: 'POST', image: f, ifMatch: profile.etag },
                  saved,
                );
              e.target.value = '';
            }}
          />
        </label>
      </section>
    </>
  );
}
