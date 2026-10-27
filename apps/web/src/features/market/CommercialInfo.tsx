import type { CommercialDto } from '../api/catalog-contract';
import { formatPrice } from '../../data/market';
export function CommercialInfo({ value }: { value?: CommercialDto }) {
  if (!value) return <p>Condições comerciais não disponibilizadas pelo produtor.</p>;
  const methods: Record<string, string> = {
    dinheiro: 'Dinheiro',
    mb_way: 'MB WAY',
    transferencia_bancaria: 'Transferência bancária',
  };
  return (
    <div className="product-commercial">
      <h2>Informação comercial pública</h2>
      <dl className="product-editorial__facts">
        {value.modalidades && (
          <div>
            <dt>Modalidades indicadas</dt>
            <dd>
              {[
                value.modalidades.levantamento && 'Levantamento',
                value.modalidades.entrega && 'Entrega',
              ]
                .filter(Boolean)
                .join(' · ') || 'Nenhuma indicada'}
            </dd>
          </div>
        )}
        {value.taxaEntregaCent !== undefined && (
          <div>
            <dt>Taxa de entrega indicada</dt>
            <dd>{formatPrice(value.taxaEntregaCent)}</dd>
          </div>
        )}
        {value.metodosPagamento && (
          <div>
            <dt>Métodos indicados</dt>
            <dd>
              {value.metodosPagamento.map((m) => methods[m] ?? m).join(' · ') || 'Não indicados'}
            </dd>
          </div>
        )}
        {value.concelhosEntregaIds && value.concelhosEntregaIds.length > 0 && (
          <div>
            <dt>Concelhos de entrega (códigos oficiais)</dt>
            <dd>{value.concelhosEntregaIds.join(', ')}</dd>
          </div>
        )}
      </dl>
      {value.disponibilidade && (
        <p>
          Horários declarados ({value.disponibilidade.fusoHorario ?? 'fuso não indicado'}):{' '}
          {(['levantamento', 'entrega'] as const).map((mode) => (
            <span key={mode}>
              {mode === 'entrega' ? 'Entrega' : 'Levantamento'}:{' '}
              {value.disponibilidade?.[mode]
                ?.map(
                  (p) =>
                    `${['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][p.diaSemana]}, ${p.inicio}–${p.fim}`,
                )
                .join('; ') || 'não indicados'}
              .{' '}
            </span>
          ))}
        </p>
      )}
      <p>Informação do produtor. A compra e a escolha de entrega ainda não estão disponíveis.</p>
    </div>
  );
}
