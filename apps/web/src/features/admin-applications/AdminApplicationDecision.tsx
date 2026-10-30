import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ProducerTextarea } from '../producer/ProducerFields';
import { useAdminApplications } from './useAdminApplications';
import { rejectionReason, type Decision } from './contracts';
export function AdminApplicationDecision() {
  const { state, editReason, validateReason, decide } = useAdminApplications();
  const [choice, setChoice] = useState<Decision>();
  const dialog = useRef<HTMLDialogElement>(null),
    panel = useRef<HTMLElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state.reasonError) panel.current?.querySelector('textarea')?.focus();
  }, [state.reasonError]);
  useEffect(() => {
    if (choice && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    }
  }, [choice]);
  useEffect(() => {
    if (state.busy && dialog.current?.open) dialog.current.focus({ preventScroll: true });
  }, [state.busy]);
  function confirm(decision: Decision) {
    if (decision === 'rejeitado' && !validateReason()) return;
    trigger.current = document.activeElement as HTMLElement;
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
      <dialog
        className="admin-decision-dialog"
        ref={dialog}
        aria-labelledby="admin-confirmation-title"
        aria-describedby="admin-confirmation-description"
        aria-busy={state.busy}
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),[tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length);
          const first = controls[0],
            last = controls.at(-1);
          if (!first) {
            event.preventDefault();
            event.currentTarget.focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCancel={(event) => {
          if (state.busy) event.preventDefault();
        }}
        onClose={() => {
          setChoice(undefined);
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <p className="eyebrow">Confirmar decisão</p>
        <h2 id="admin-confirmation-title">
          {choice === 'aprovado' ? 'Aprovar esta candidatura?' : 'Rejeitar esta candidatura?'}
        </h2>
        <p id="admin-confirmation-description">
          {state.data?.nomePublico}.{' '}
          {choice === 'aprovado'
            ? 'O serviço atribuirá as capacidades de produtor.'
            : 'O motivo ficará disponível ao candidato para rever a sua candidatura.'}
        </p>
        {choice === 'rejeitado' && (
          <blockquote tabIndex={0} role="region" aria-label="Motivo da rejeição a confirmar">
            {rejectionReason(state.reason)}
          </blockquote>
        )}
        <div className="admin-decision-actions">
          <Button
            data-cancel
            disabled={state.busy}
            variant="secondary"
            onClick={() => dialog.current?.close()}
          >
            Continuar análise
          </Button>
          <Button
            disabled={state.busy}
            onClick={() => {
              if (choice) void decide(choice);
            }}
          >
            {state.busy
              ? 'A confirmar decisão…'
              : choice === 'aprovado'
                ? 'Confirmar aprovação'
                : 'Confirmar rejeição'}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
