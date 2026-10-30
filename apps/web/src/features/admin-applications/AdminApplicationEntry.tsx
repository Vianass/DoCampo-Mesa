import { Button } from '../../components/Button';
import { useApplicationList } from './useApplicationList';
import { adminApplicationsPath } from './contracts';
export function AdminApplicationEntry() {
  const resource = useApplicationList({
    pagina: 1,
    porPagina: 12,
    estado: 'pendente',
    ordem: 'recentes',
  });
  return (
    <section className="admin-application-entry" aria-labelledby="admin-applications-entry-title">
      <p className="eyebrow">Candidaturas de produtores · Dados reais</p>
      <h2 id="admin-applications-entry-title">Novas origens à mesa.</h2>
      <p>Analisa a atividade apresentada e regista uma decisão fundamentada.</p>
      <p role="status">
        {resource.loading
          ? 'A consultar candidaturas pendentes…'
          : resource.error
            ? 'O total de candidaturas está indisponível.'
            : `${resource.data!.total} ${resource.data!.total === 1 ? 'candidatura pendente' : 'candidaturas pendentes'} no total.`}
      </p>
      <Button to={adminApplicationsPath + '?estado=pendente'}>Analisar candidaturas</Button>
    </section>
  );
}
