import { useEffect, useRef, useState } from 'react';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { Button } from '../../components/Button';
import { ProducerTextarea } from '../producer/ProducerFields';
import { useAdminApplications } from './useAdminApplications';
import { rejectionReason, type Decision } from './contracts';
export function AdminApplicationDecision() {
  const { state, editReason, validateReason, decide } = useAdminApplications();
  const [choice, setChoice] = useState<Decision>();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.reasonError) panel.current?.querySelector('textarea')?.focus();
  }, [state.reasonError]);
  function confirm(decision: Decision) {
    if (decision === 'rejeitado' && !validateReason()) return;
    setChoice(decision);
  }
  return (
    <section className="admin-decision-panel" ref={panel} aria-labelledby="admin-decision-title">
      <p className="eyebrow">Análise administrativa</p>
      <h2 id="admin-decision-title">Uma decisão responsável.</h2>
      <p>
        A confirmação será registada pelo serviço. A aprovação concede acesso de produtor, sem
        publicar produtos ou configurar vendas.
      </p>
      <form
        noValidate
        aria-label="Decidir candidatura"
        onSubmit={(event) => {
          event.preventDefault();
          confirm('rejeitado');
        }}
        aria-busy={state.busy}
      >
        <fieldset disabled={state.busy || state.locked}>
          <legend className="visually-hidden">Decisão sobre a candidatura</legend>
          <Button onClick={() => confirm('aprovado')}>Aprovar candidatura</Button>
          <div className="admin-rejection">
            <ProducerTextarea
              name="justificacao"
              label="Motivo da rejeição"
              value={state.reason}
              onChange={(event) => editReason(event.target.value)}
              required
              rows={4}
              error={state.reasonError}
              hint="Obrigatório apenas para rejeitar. Até 2000 caracteres. O candidato poderá consultar este motivo."
            />
            <Button type="submit" variant="secondary">
              Rejeitar candidatura
            </Button>
          </div>
        </fieldset>
      </form>
      <ConfirmationDialog
        open={!!choice}
        busy={state.busy}
        title={choice === 'aprovado' ? 'Aprovar esta candidatura?' : 'Rejeitar esta candidatura?'}
        description={
          <>
            {state.data?.nomePublico}.{' '}
            {choice === 'aprovado'
              ? 'O serviço atribuirá as capacidades de produtor.'
              : 'O motivo ficará disponível ao candidato para rever a sua candidatura.'}
          </>
        }
        confirmLabel={choice === 'aprovado' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
        onClose={() => setChoice(undefined)}
        onConfirm={() => {
          if (choice) void decide(choice);
        }}
      >
        {choice === 'rejeitado' && (
          <blockquote tabIndex={0} role="region" aria-label="Motivo da rejeição a confirmar">
            {rejectionReason(state.reason)}
          </blockquote>
        )}
      </ConfirmationDialog>
    </section>
  );
}
