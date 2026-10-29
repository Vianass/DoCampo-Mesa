import { useEffect, useRef } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../auth/useAuth';
import { ApplicationForm } from './ApplicationForm';
import { ApplicationDetails } from './ApplicationDetails';
import { stateLabels } from './model';
import { useApplication } from './useApplication';
import { orderDate } from '../orders/format';

export default function ProducerApplicationPage() {
  const { session, revalidate } = useAuth();
  const { state, load } = useApplication();
  const stateTitle = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const manualRefresh = useRef(false);
  useEffect(() => {
    void load();
  }, [load]);
  async function refresh() {
    manualRefresh.current = true;
    const current = await load();
    if (current?.estado === 'aprovado') await revalidate();
  }
  const application = state.application;
  const rejected = application?.estado === 'rejeitado';
  function focusForm() {
    content.current?.querySelector<HTMLInputElement>('form input:not(:disabled)')?.focus();
  }
  useEffect(() => {
    if (state.error) {
      manualRefresh.current = false;
      feedback.current?.focus();
    }
  }, [state.error]);
  useEffect(() => {
    if (state.status !== 'ready' || state.error) return;
    if (state.notice || manualRefresh.current) {
      manualRefresh.current = false;
      if (application) stateTitle.current?.focus();
      else focusForm();
    }
  }, [application, state.notice, state.status, state.error]);
  const process = (
    <>
      <Icon name="leaf" className="application-leaf" />
      <p className="eyebrow">Da origem ao encontro</p>
      <h2>Um caminho com três passos.</h2>
      <ol>
        <li>
          <strong>Apresenta a tua atividade.</strong>
          <p>Nome público, descrição, localidade, concelho e telefone de contacto.</p>
        </li>
        <li>
          <strong>A equipa analisa.</strong>
          <p>A candidatura aguarda uma decisão administrativa. Podes acompanhar o estado aqui.</p>
        </li>
        <li>
          <strong>Prepara o teu lugar no mercado.</strong>
          <p>
            Depois da aprovação, tens acesso à área do produtor. Os produtos exigem preparação e
            publicação próprias.
          </p>
        </li>
      </ol>
      <p>A submissão não publica produtos nem garante a aprovação.</p>
    </>
  );
  return (
    <div className="producer-application">
      <header className="application-intro">
        <p className="eyebrow">Candidatura a produtor · Do Campo à Mesa</p>
        <h1>
          A tua produção,
          <br />
          <em>mais perto.</em>
        </h1>
        <p>
          Há pessoas à procura do que a tua terra tem de melhor. Apresenta a tua atividade e dá o
          primeiro passo para fazer parte do mercado.
        </p>
        {session.kind === 'authenticated' &&
          session.user.papeis.includes('comprador') &&
          !session.user.papeis.includes('produtor') && (
            <p>
              A tua conta mantém o acesso de comprador. As capacidades de produtor dependem da
              aprovação da equipa e da confirmação pelo serviço.
            </p>
          )}
        <Button to="/area" variant="text">
          ← Voltar à minha área
        </Button>
      </header>
      <div className="application-layout">
        <div className="application-content" ref={content}>
          {(state.status === 'idle' || state.status === 'loading') && (
            <LoadingSkeleton label="A consultar a tua candidatura" count={2} />
          )}
          {state.error && (
            <div
              className="application-feedback"
              ref={feedback}
              role="group"
              aria-label="Recuperar candidatura"
              tabIndex={-1}
            >
              <p role="alert">{state.error}</p>
              <Button variant="secondary" disabled={state.saving} onClick={() => void refresh()}>
                {state.uncertain ? 'Confirmar estado da candidatura' : 'Tentar novamente'}
              </Button>
            </div>
          )}
          <div role="status" aria-live="polite" aria-atomic="true">
            {state.notice && (
              <p className="application-feedback application-feedback--success">{state.notice}</p>
            )}
            {!state.notice && state.status === 'ready' && application && (
              <span className="visually-hidden">
                Estado da candidatura: {stateLabels[application.estado]}.
              </span>
            )}
          </div>
          {state.status === 'ready' && (
            <>
              {application && (
                <section className="application-paper" aria-labelledby="application-state-title">
                  <span className={`application-state application-state--${application.estado}`}>
                    {stateLabels[application.estado]}
                  </span>
                  <h2 id="application-state-title" tabIndex={-1} ref={stateTitle}>
                    {application.estado === 'pendente'
                      ? 'Recebemos a tua candidatura.'
                      : application.estado === 'aprovado'
                        ? 'O teu lugar no mercado está aprovado.'
                        : 'Há informação a rever.'}
                  </h2>
                  <p>
                    {application.estado === 'pendente'
                      ? 'A equipa vai analisar os dados que partilhaste. Enquanto aguardas, a tua conta continua disponível para comprar.'
                      : application.estado === 'aprovado'
                        ? 'A tua candidatura foi aprovada. Podes continuar a comprar e preparar a tua atividade como produtor.'
                        : 'Lê o motivo da decisão e revê os dados antes de reapresentar a candidatura.'}
                  </p>
                  {application.decisao?.justificacao && (
                    <blockquote className="application-decision">
                      <p className="eyebrow">Motivo da decisão</p>
                      <p>{application.decisao.justificacao}</p>
                    </blockquote>
                  )}
                  {rejected && application.decisao && (
                    <p>Decisão comunicada em {orderDate(application.decisao.data)}.</p>
                  )}
                  {!rejected && <ApplicationDetails application={application} />}
                  <div className="application-actions">
                    {rejected && <Button onClick={focusForm}>Rever e reapresentar</Button>}
                    <Button variant="secondary" onClick={() => void refresh()}>
                      Atualizar estado
                    </Button>
                    {application.estado === 'aprovado' &&
                      (session.kind === 'authenticated' &&
                      session.user.papeis.includes('produtor') ? (
                        <Button to="/area/produtor">Ir para a área do produtor</Button>
                      ) : (
                        <Button onClick={() => void revalidate()}>
                          Confirmar acesso à área do produtor
                        </Button>
                      ))}
                  </div>
                  {rejected && (
                    <details className="application-disclosure">
                      <summary>Dados da candidatura rejeitada</summary>
                      <ApplicationDetails application={application} />
                    </details>
                  )}
                </section>
              )}
              {(!application || application.estado === 'rejeitado') && <ApplicationForm />}
              {!!application?.historico.length && (
                <details className="application-paper application-history">
                  <summary>Candidaturas anteriores ({application.historico.length})</summary>
                  <p>O histórico conserva os dados e as decisões das tentativas anteriores.</p>
                  {application.historico.map((attempt, index) => (
                    <article key={`${attempt.submetidaEm}-${index}`}>
                      <h3>
                        Tentativa {index + 1} · {attempt.nomePublico}
                      </h3>
                      <ApplicationDetails application={attempt} />
                      <blockquote className="application-decision">
                        <p className="eyebrow">Motivo da rejeição</p>
                        <p>{attempt.decisao?.justificacao}</p>
                      </blockquote>
                    </article>
                  ))}
                </details>
              )}
            </>
          )}
        </div>
        <aside className="application-process" aria-label="Como funciona a candidatura">
          {rejected ? (
            <details className="application-disclosure">
              <summary>Como funciona a candidatura</summary>
              {process}
            </details>
          ) : (
            process
          )}
        </aside>
      </div>
    </div>
  );
}
