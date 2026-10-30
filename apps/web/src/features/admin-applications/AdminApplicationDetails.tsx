import { ApplicationDetails } from '../producer-application/ApplicationDetails';
import { stateLabels } from '../producer-application/model';
import { StatusBadge } from '../../components/StatusBadge';
import type { AdministrativeApplication } from './contracts';
export function AdminApplicationDetails({ data }: { data: AdministrativeApplication }) {
  return (
    <>
      <section className="admin-application-paper" aria-labelledby="admin-application-state">
        <StatusBadge
          tone={
            data.estado === 'pendente'
              ? 'seasonal'
              : data.estado === 'aprovado'
                ? 'organic'
                : 'neutral'
          }
        >
          {stateLabels[data.estado]}
        </StatusBadge>
        <h2 id="admin-application-state" tabIndex={-1}>
          {data.nomePublico}
        </h2>
        {data.decisao?.justificacao && (
          <blockquote className="admin-application-reason">
            <p className="eyebrow">Motivo da rejeição</p>
            <p>{data.decisao.justificacao}</p>
          </blockquote>
        )}
        <ApplicationDetails application={data} />
        <details className="admin-application-audit">
          <summary>Identificação e auditoria</summary>
          <dl className="application-data">
            <div>
              <dt>Identificador da candidatura</dt>
              <dd>{data.id}</dd>
            </div>
            <div>
              <dt>Identificador da conta candidata</dt>
              <dd>{data.utilizadorId}</dd>
            </div>
            {data.administradorId && (
              <div>
                <dt>Administrador responsável pela decisão</dt>
                <dd>{data.administradorId}</dd>
              </div>
            )}
          </dl>
        </details>
      </section>
      {data.historico.length > 0 && (
        <details className="admin-application-paper admin-application-history">
          <summary>Tentativas anteriores ({data.historico.length})</summary>
          {data.historico.map((attempt, index) => (
            <article key={attempt.submetidaEm + index}>
              <h3>
                Tentativa {index + 1} · {attempt.nomePublico}
              </h3>
              <ApplicationDetails application={attempt} />
              <blockquote className="admin-application-reason">
                <p className="eyebrow">Motivo da rejeição</p>
                <p>{attempt.decisao?.justificacao}</p>
              </blockquote>
              <p>Administrador responsável: {attempt.administradorId}</p>
            </article>
          ))}
        </details>
      )}
    </>
  );
}
