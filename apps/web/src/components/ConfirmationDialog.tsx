import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
/** Confirmação nativa partilhada: fundo inerte, cancelamento seguro e foco contido. */
export function ConfirmationDialog({
  open,
  busy,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    id = useId();
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      trigger.current = document.activeElement as HTMLElement;
      dialog.current.showModal();
      dialog.current.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (busy && dialog.current?.open) dialog.current.focus({ preventScroll: true });
  }, [busy]);
  return (
    <dialog
      className="admin-decision-dialog"
      ref={dialog}
      aria-labelledby={id + '-title'}
      aria-describedby={id + '-description'}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
        const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),[tabindex="0"]',
            ),
          ].filter((el) => el.getClientRects().length),
          first = controls[0],
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
        if (busy) event.preventDefault();
      }}
      onClose={() => {
        onClose();
        if (trigger.current?.isConnected) trigger.current.focus();
      }}
    >
      <p className="eyebrow">Confirmar decisão</p>
      <h2 id={id + '-title'}>{title}</h2>
      <p id={id + '-description'}>{description}</p>
      {children}
      <div className="admin-decision-actions">
        <Button
          data-cancel
          disabled={busy}
          variant="secondary"
          onClick={() => dialog.current?.close()}
        >
          Continuar análise
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? 'A confirmar decisão…' : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
