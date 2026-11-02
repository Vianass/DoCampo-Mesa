import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { Button } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { ProducerTextarea } from '../producer/ProducerFields';
import {
  parseOwnLookup,
  parseOwnReport,
  reportLabels,
  type OwnReport,
  type TargetKind,
} from './contracts';
export function ReportContent({
  kind,
  id,
  label,
}: {
  kind: TargetKind;
  id: string;
  label: string;
}) {
  const { session } = useAuth(),
    { pathname, search } = useLocation();
  if (session.kind !== 'authenticated')
    return (
      <p className="content-report-entry">
        <Button variant="text" to={'/entrar?destino=' + encodeURIComponent(pathname + search)}>
          Entrar para denunciar {label}
        </Button>
      </p>
    );
  return (
    <ReportForm
      key={session.user.id + ':' + session.expiresAt + ':' + kind + ':' + id}
      kind={kind}
      id={id}
      label={label}
    />
  );
}
function ReportForm({ kind, id, label }: { kind: TargetKind; id: string; label: string }) {
  const { request, session } = useAuth(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<OwnReport>();
  const controller = useRef<AbortController | undefined>(undefined),
    writing = useRef(false),
    feedback = useRef<HTMLDivElement>(null);
  const ready = session.kind === 'authenticated' && session.status === 'ready';
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (error || saved) feedback.current?.focus();
  }, [error, saved]);
  const lookup = () => {
    if (writing.current || !ready) return;
    writing.current = true;
    setBusy(true);
    setError('');
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    void request(
      '/me/content-reports?alvoTipo=' + kind + '&alvoId=' + id,
      parseOwnLookup,
      {},
      c.signal,
    )
      .then((r) => {
        if (!c.signal.aborted) {
          setSaved(r.denuncia ?? undefined);
          setLocked(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setLocked(true);
          setError('Não foi possível consultar a tua denúncia. Confirma o estado antes de enviar.');
        }
      })
      .finally(() => {
        if (!c.signal.aborted) {
          writing.current = false;
          setBusy(false);
        }
      });
  };
  return (
    <section className="content-report" aria-label={'Sinalizar ' + label}>
      <Button
        variant="text"
        disabled={!ready || busy}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) lookup();
        }}
      >
        Denunciar {label}
      </Button>
      {open && (
        <>
          <h3>Sinalizar um conteúdo.</h3>
          <p>
            A denúncia é privada e exige análise administrativa. Não oculta o conteúdo
            automaticamente. Podes enviar uma denúncia por conta e conteúdo.
          </p>
          {(error || saved) && (
            <div ref={feedback} tabIndex={-1} role="group" aria-label="Resultado da denúncia">
              {error && <p role="alert">{error}</p>}
              {saved && (
                <>
                  <p role="status">A tua denúncia está registada · {reportLabels[saved.estado]}.</p>
                  <blockquote>{saved.motivo}</blockquote>
                </>
              )}
            </div>
          )}
          {!saved && (
            <form
              aria-label={'Denunciar ' + label}
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !busy && !locked) setConfirm(true);
              }}
            >
              <fieldset disabled={!ready || busy || locked}>
                <legend className="visually-hidden">Motivo da denúncia</legend>
                <ProducerTextarea
                  label="Motivo da denúncia"
                  name="motivoDenuncia"
                  required
                  maxLength={1000}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  hint="Até 1000 caracteres. Evita incluir dados pessoais desnecessários."
                />
                <Button type="submit" variant="secondary">
                  Rever denúncia
                </Button>
              </fieldset>
            </form>
          )}
          <Button variant="text" disabled={!ready || busy} onClick={lookup}>
            Consultar a minha denúncia
          </Button>
        </>
      )}
      {confirm && ready && (
        <ConfirmationDialog
          open
          busy={busy}
          title="Enviar esta denúncia?"
          description="O motivo fica associado à tua conta e é acessível apenas à administração. O conteúdo será analisado sem ocultação automática."
          confirmLabel="Confirmar denúncia"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            if (writing.current || locked) return;
            writing.current = true;
            setBusy(true);
            setError('');
            const c = new AbortController();
            controller.current = c;
            void request(
              '/content-reports',
              parseOwnReport,
              {
                method: 'POST',
                expectedStatus: 201,
                body: { alvoTipo: kind, alvoId: id, motivo: reason },
              },
              c.signal,
            )
              .then((r) => {
                if (!c.signal.aborted) {
                  setSaved(r);
                  setConfirm(false);
                }
              })
              .catch((e) => {
                if (!c.signal.aborted) {
                  setConfirm(false);
                  setLocked(true);
                  setError(
                    e instanceof ApiFailure && e.codigo === 'DENUNCIA_DUPLICADA'
                      ? 'Já denunciaste este conteúdo. Consulta a tua denúncia.'
                      : e instanceof ApiFailure && e.status === 429
                        ? 'Atingiste o limite de pedidos. Aguarda e consulta a tua denúncia antes de repetir.'
                        : 'Não foi possível confirmar o envio. Consulta a tua denúncia antes de repetir.',
                  );
                }
              })
              .finally(() => {
                if (!c.signal.aborted) {
                  writing.current = false;
                  setBusy(false);
                }
              });
          }}
        >
          <blockquote>{reason.normalize('NFC').trim()}</blockquote>
        </ConfirmationDialog>
      )}
    </section>
  );
}
