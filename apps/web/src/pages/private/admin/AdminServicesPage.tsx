import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import { AdminEmpty, AdminBadge } from '../../../features/admin/AdminComponents';
import { serviceLabels } from '../../../features/admin/selectors';
import { buyerDate } from '../../../features/buyer/selectors';
export default function AdminServicesPage() {
  return (
    <AdminPageFrame
      title="Saber o que se conhece."
      accent="E o que falta observar."
      description="Preparação visual da supervisão Cloud. Nenhum serviço é consultado, testado ou apresentado como operacional."
    >
      {(data) => (
        <>
          <aside className="admin-service-disclosure">
            <h2>Monitorização real: não implementada.</h2>
            <p>
              Estado real desconhecido para todos os serviços. Os cenários abaixo são exemplos
              simulados de apresentação; não são diagnósticos, medições ou resultados de pedidos.
            </p>
          </aside>
          {!data.services.length ? (
            <AdminEmpty section="servicos" />
          ) : (
            <ul className="admin-services">
              {data.services.map((service) => (
                <li key={service.id}>
                  <p className="eyebrow">Serviço previsto</p>
                  <h2>{service.name}</h2>
                  <p>{service.purpose}</p>
                  <div className="admin-service-real">
                    <strong>Estado real: não monitorizado</strong>
                    <p>Sem observação real ou ligação ao serviço.</p>
                  </div>
                  <h3>Exemplo simulado</h3>
                  <AdminBadge>{serviceLabels[service.illustration.status]} · simulado</AdminBadge>
                  <p>{service.illustration.note}</p>
                  <small>
                    {service.illustration.observedAt
                      ? 'Data fictícia do exemplo: ' + buyerDate(service.illustration.observedAt)
                      : 'Sem data de observação no exemplo.'}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <p className="admin-help">
            A monitorização futura depende da infraestrutura, dos endpoints e do âmbito a acordar em
            Q16. Disponibilidade, latência, alertas e acesso a consolas não estão implementados.
          </p>
        </>
      )}
    </AdminPageFrame>
  );
}
