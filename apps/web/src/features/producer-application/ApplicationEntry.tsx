import { useEffect } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { useApplication } from './useApplication';
import { applicationPath } from './model';

export function ApplicationEntry() {
  const { state, load } = useApplication();
  useEffect(() => {
    void load();
  }, [load]);
  const status = state.status === 'ready' ? state.application?.estado : undefined;
  return (
    <section className="application-entry" aria-labelledby="application-entry-title">
      <div>
        <p className="eyebrow">Também há lugar para quem produz</p>
        <h2 id="application-entry-title">
          {status === 'aprovado'
            ? 'A tua candidatura está aprovada.'
            : status === 'pendente'
              ? 'A tua candidatura está em análise.'
              : status === 'rejeitado'
                ? 'Podemos voltar à tua candidatura.'
                : 'Do teu campo para esta mesa.'}
        </h2>
        <p>
          Consulta o teu percurso de entrada como produtor, sem deixar de fazer as tuas compras.
        </p>
      </div>
      <Link className="editorial-text-link" to={applicationPath}>
        {status === 'pendente'
          ? 'Acompanhar candidatura'
          : status === 'rejeitado'
            ? 'Rever candidatura'
            : status === 'aprovado'
              ? 'Consultar aprovação'
              : 'Conhecer a candidatura'}{' '}
        <Icon name="arrow" />
      </Link>
    </section>
  );
}
