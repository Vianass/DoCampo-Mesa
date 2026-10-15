import { Button } from '../../../components/Button';
import { StatusBadge } from '../../../components/StatusBadge';
import { buyerDate } from '../../../features/buyer/selectors';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
export default function ProducerApplicationPage() {
  return (
    <ProducerPageFrame
      title="A candidatura."
      description="Da apresentação da tua origem à decisão de quem cuida do mercado."
    >
      {(data) => (
        <section className="producer-application">
          <div className="producer-section-heading">
            <h2>Um percurso para conhecer.</h2>
            <StatusBadge tone="neutral">Pendente · exemplo fictício</StatusBadge>
          </div>
          <p>
            Não existe candidatura associada a esta demonstração. Este é um exemplo de estado
            pendente, não uma submissão ou aprovação administrativa.
          </p>
          <dl className="producer-facts">
            <div>
              <dt>Estado do exemplo</dt>
              <dd>
                {data.application.status === 'pendente'
                  ? 'A aguardar decisão administrativa'
                  : 'Estado por consultar'}
              </dd>
            </div>
            <div>
              <dt>Data ilustrativa de submissão</dt>
              <dd>
                <time dateTime={data.application.submittedAt}>
                  {buyerDate(data.application.submittedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Nome público necessário</dt>
              <dd>{data.profile.name}</dd>
            </div>
            <div>
              <dt>Localidade necessária</dt>
              <dd>{data.profile.locality}</dd>
            </div>
          </dl>
          <h2>O que será necessário.</h2>
          <ul className="producer-reading-list">
            <li>Conta de produtor com nome, email e palavra-passe no registo.</li>
            <li>Nome público e localidade da produção; descrição opcional.</li>
            <li>Informação pública da origem, separada dos dados privados da conta.</li>
          </ul>
          <h2>Etapas da candidatura.</h2>
          <ol className="producer-steps">
            <li>
              <strong>Preparar a apresentação</strong>
              <p>Reunir os dados da conta e da produção.</p>
            </li>
            <li>
              <strong>Submeter e aguardar análise</strong>
              <p>A submissão real não está disponível nesta fase.</p>
            </li>
            <li>
              <strong>Conhecer a decisão</strong>
              <p>Aprovação ou rejeição só pelo administrador. Não existe decisão neste cenário.</p>
            </li>
          </ol>
          <p className="producer-help">
            Direitos antes da aprovação e recandidatura aguardam Q04. Editar dados nesta área não
            publica produtos nem concede aprovação. O perfil público fictício já existente não
            comprova aprovação.
          </p>
          <div className="producer-actions">
            <Button to="/area/produtor/perfil" variant="secondary">
              Consultar a apresentação
            </Button>
            <Button to="/area/produtor" variant="text">
              Voltar à visão geral
            </Button>
          </div>
        </section>
      )}
    </ProducerPageFrame>
  );
}
