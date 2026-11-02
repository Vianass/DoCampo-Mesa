import { Types } from 'mongoose';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function pick(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!object(value)) return {};
  return Object.fromEntries(
    fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]]),
  );
}

/** Preserva a forma JSON anterior; o novo bloco comercial não entra implicitamente no contrato. */
export function redactProducerSerialization(
  value: Record<string, unknown>,
): Record<string, unknown> {
  Reflect.deleteProperty(value, 'moderacao');
  Reflect.deleteProperty(value, 'telefone');
  Reflect.deleteProperty(value, 'comercial');
  Reflect.deleteProperty(value, 'revisaoOperacional');
  Reflect.deleteProperty(value, 'historicoCandidaturas');
  if (object(value.aprovacao) && object(value.aprovacao.decisao))
    Reflect.deleteProperty(value.aprovacao.decisao, 'autor');
  if (object(value.userId) && '_id' in value.userId) value.userId = value.userId._id;
  return value;
}

/** Projeção pública aditiva, também para lean/populate; não atribui autorização por papel. */
export function projectProducerPublic(value: unknown): Record<string, unknown> {
  if (!object(value)) return {};
  const result = pick(value, [
    'nomePublico',
    'nomeResponsavel',
    'localidade',
    'concelho',
    'descricao',
    'createdAt',
    'updatedAt',
  ]);
  if (value._id instanceof Types.ObjectId) result.id = value._id.toHexString();
  if (object(value.localizacaoPublica) && value.localizacaoPublica.autorizada === true) {
    const location = value.localizacaoPublica;
    if (
      typeof location.latitude === 'number' &&
      Number.isFinite(location.latitude) &&
      Math.abs(location.latitude) <= 90 &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.longitude) &&
      Math.abs(location.longitude) <= 180 &&
      typeof location.descricao === 'string'
    )
      result.localizacaoPublica = pick(location, ['latitude', 'longitude', 'descricao']);
  }
  if (object(value.imagem)) result.imagem = pick(value.imagem, ['url', 'alt']);
  if (object(value.aprovacao)) result.aprovacao = pick(value.aprovacao, ['estado']);
  if (object(value.comercial)) {
    const settings = value.comercial;
    const commercial = pick(settings, ['taxaEntregaCent', 'catalogoConcelhosVersao']);
    if (object(settings.modalidades))
      commercial.modalidades = pick(settings.modalidades, ['levantamento', 'entrega']);
    if (Array.isArray(settings.concelhosEntregaIds))
      commercial.concelhosEntregaIds = settings.concelhosEntregaIds.filter(
        (item) => typeof item === 'string',
      );
    if (Array.isArray(settings.metodosPagamento))
      commercial.metodosPagamento = settings.metodosPagamento.filter(
        (item) => typeof item === 'string',
      );
    if (object(settings.disponibilidade)) {
      const availability = pick(settings.disponibilidade, ['fusoHorario']);
      for (const mode of ['levantamento', 'entrega']) {
        const periods = settings.disponibilidade[mode];
        if (Array.isArray(periods))
          availability[mode] = periods
            .filter(object)
            .map((period) => pick(period, ['diaSemana', 'inicio', 'fim']));
      }
      commercial.disponibilidade = availability;
    }
    result.comercial = commercial;
  }
  return result;
}
