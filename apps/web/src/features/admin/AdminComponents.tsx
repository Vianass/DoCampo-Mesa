import { useId, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FormField } from '../../components/FormField';
import { StatusBadge } from '../../components/StatusBadge';
import { buyerDate } from '../buyer/selectors';
import { adminHome, byId, validateDecision } from './selectors';
import { useAdmin } from './useAdmin';
import type { AdminDataset, AdminDecision, AdminDecisionDraft } from './types';

export function AdminBadge({
  children,
  pending = false,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  return <StatusBadge tone={pending ? 'seasonal' : 'neutral'}>{children}</StatusBadge>;
}
export function AdminEmpty({ section, missing = false }: { section: string; missing?: boolean }) {
  return (
    <EmptyState
      title={missing ? 'Este registo não está disponível.' : 'Sem registos para esta escolha.'}
      description={
        missing
          ? 'O identificador não existe neste cenário demonstrativo.'
          : 'Experimenta outra pesquisa, limpa os filtros ou escolhe o cenário com atividade.'
      }
      action={
        <Button to={adminHome + '/' + section} variant="secondary">
          Voltar à listagem
        </Button>
      }
    />
  );
}
export function AdminFilters({
  label,
  options,
  status,
  search,
  defaultStatus = 'todos',
}: {
  label: string;
  options: Record<string, string>;
  status: string;
  search: string;
  defaultStatus?: string;
}) {
  const [params, setParams] = useSearchParams();
  const id = useId();
  const [pending, setPending] = useState<{ source: URLSearchParams; value: string } | null>(null);
  if (pending && pending.source !== params) setPending(null);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || (key === 'estado' && value === defaultStatus)) next.delete(key);
    else next.set(key, value);
    if (key === 'pesquisa') setPending({ source: params, value });
    setParams(next, { replace: key === 'pesquisa' });
  };
  return (
    <div className="admin-filters">
      <FormField
        id={id + '-search'}
        type="search"
        label={'Pesquisar ' + label}
        value={pending?.value ?? search}
        onChange={(e) => change('pesquisa', e.target.value)}
      />
      <div>
        <label htmlFor={id + '-state'}>
          {label === 'utilizadores' ? 'Papel dos utilizadores' : 'Estado de ' + label}
        </label>
        <select
          id={id + '-state'}
          className="form-select"
          value={status}
          onChange={(e) => change('estado', e.target.value)}
        >
          <option value="todos">Todos</option>
          {Object.entries(options).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="text"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.delete('pesquisa');
          next.set('estado', 'todos');
          setPending(null);
          setParams(next);
        }}
      >
        Limpar filtros
      </Button>
    </div>
  );
}
export function AdminDecisionRecord({
  data,
  decision,
}: {
  data: AdminDataset;
  decision: AdminDecision;
}) {
  return (
    <aside className="admin-decision-record">
      <h3>Decisão demonstrativa registada.</h3>
      <dl className="admin-facts">
        <div>
          <dt>Autor fictício</dt>
          <dd>{byId(data.users, decision.actorId)?.displayName ?? 'Autor indisponível'}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>
            <time dateTime={decision.decidedAt}>
              {buyerDate(decision.decidedAt)} ·{' '}
              {new Date(decision.decidedAt).toLocaleTimeString('pt-PT', {
                timeZone: 'Europe/Lisbon',
              })}
            </time>
          </dd>
        </div>
        <div>
          <dt>Motivo</dt>
          <dd>{decision.reason || 'Sem motivo adicional.'}</dd>
        </div>
      </dl>
      <p>Sem efeito público. Uma decisão concluída não pode ser substituída neste cenário.</p>
    </aside>
  );
}
export function AdminDecisionForm({ kind, id }: Pick<AdminDecisionDraft, 'kind' | 'id'>) {
  const { decide } = useAdmin();
  const prefix = useId();
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const application = kind === 'application';
  return (
    <form
      className="admin-decision-form"
      aria-label={
        application ? 'Decidir candidatura demonstrativa' : 'Moderar avaliação demonstrativa'
      }
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const draft = { kind, id, choice, reason };
        const message = validateDecision(draft);
        setError(message);
        if (message) requestAnimationFrame(() => summary.current?.focus());
        else decide(draft);
      }}
    >
      <h3>{application ? 'Uma decisão sobre a candidatura.' : 'Uma decisão sobre a avaliação.'}</h3>
      <p>
        Esta ação afeta apenas a demonstração atual. Não envia notificações nem altera dados
        públicos.
      </p>
      {error && (
        <div
          className="admin-form-error"
          role="alert"
          tabIndex={-1}
          ref={summary}
          id={prefix + '-error'}
        >
          {error}
        </div>
      )}
      <label htmlFor={prefix + '-choice'}>Decisão demonstrativa</label>
      <select
        id={prefix + '-choice'}
        className="form-select"
        value={choice}
        aria-invalid={!!error && !choice}
        aria-describedby={error ? prefix + '-error' : undefined}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Escolher uma decisão</option>
        {(application
          ? [
              ['aprovado', 'Aprovar nesta sessão'],
              ['rejeitado', 'Rejeitar nesta sessão'],
            ]
          : [
              ['mantida', 'Manter nesta sessão'],
              ['oculta', 'Ocultar nesta sessão'],
            ]
        ).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <FormField
        id={prefix + '-reason'}
        label="Motivo da decisão (opcional)"
        hint="Até 500 caracteres. Não introduzas dados pessoais."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-invalid={reason.trim().length > 500}
      />
      <Button type="submit">
        {application ? 'Simular decisão de candidatura' : 'Simular decisão de moderação'}
      </Button>
    </form>
  );
}
