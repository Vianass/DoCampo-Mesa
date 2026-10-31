import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { categories } from '../api/catalog-contract';
import { cents, euros } from '../auctions/model';
import {
  parseOwnProduct,
  productInput,
  publicationLabels,
  type OwnProduct,
  type ProductInput,
} from './contracts';
import { useManagementMutation } from './useManagement';
import { ManagedPhoto, MutationFeedback } from './ManagementComponents';

export function ProductForm({
  product,
  refresh,
  saved,
}: {
  product?: OwnProduct;
  refresh: () => void;
  saved: (p: OwnProduct) => void;
}) {
  const initial: ProductInput = product
    ? productInput(product)
    : { nome: '', ingredientes: [], etiquetas: [], imagens: [] };
  const [draft, setDraft] = useState(initial),
    [price, setPrice] = useState(product?.precoCent === undefined ? '' : euros(product.precoCent)),
    [state, setState] = useState(product?.estadoPublicacao ?? 'rascunho'),
    [remove, setRemove] = useState(false),
    [validation, setValidation] = useState('');
  const mutation = useManagementMutation();
  const change = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setDraft((v) => ({ ...v, [key]: value }));
  const unit = draft.unidadeVenda,
    measure = unit?.unidadeBase ?? 'un',
    reserved = !!product?.reservasLeilao?.some((r) => r.quantidade > 0);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    price !== (product?.precoCent === undefined ? '' : euros(product.precoCent)) ||
    state !== (product?.estadoPublicacao ?? 'rascunho');
  const number = (v: string) => (v === '' ? undefined : Number(v));
  const immutable = product?.estadoPublicacao === 'arquivado';
  return (
    <>
      <MutationFeedback error={mutation.error} retry={refresh} />
      {validation && <p role="alert">{validation}</p>}
      {reserved && (
        <aside className="management-feedback">
          <h2>Lotes já reservados</h2>
          <p>
            O stock abaixo é livre, depois das reservas. Não inclui as quantidades comprometidas nem
            as encomendas já compradas. A unidade mantém-se enquanto houver reservas.
          </p>
          <ul>
            {product?.reservasLeilao?.map((r, i) => (
              <li key={i}>
                {r.quantidade} {r.unidade} ·{' '}
                {r.estado === 'afeta_vencedor' ? 'Afeto ao vencedor' : 'Reservado ou por repor'}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {immutable && (
        <p>Produto arquivado. O histórico está preservado e o restauro não está disponível.</p>
      )}
      <form
        aria-label="Gestão do produto"
        onSubmit={(e) => {
          e.preventDefault();
          const value = price ? cents(price) : undefined;
          if (price && (value === undefined || value < 1 || value > 1000000)) {
            setValidation('Indica um preço entre 0,01 € e 10 000 €.');
            return;
          }
          if (draft.ingredientesAplicaveis && !draft.ingredientes.length && state === 'publicado') {
            setValidation('Indica os ingredientes aplicáveis antes de publicar.');
            return;
          }
          setValidation('');
          const body = {
            ...draft,
            precoCent: value,
            ...(product ? { estadoPublicacao: state } : {}),
          };
          void mutation.run(
            product ? '/products/' + product.id : '/products',
            parseOwnProduct,
            {
              method: product ? 'PUT' : 'POST',
              body,
              ...(product ? { ifMatch: product.etag } : {}),
              expectedStatus: product ? 200 : 201,
            },
            saved,
          );
        }}
      >
        <fieldset disabled={mutation.busy || mutation.blocked || immutable}>
          <legend>Os detalhes da tua produção</legend>
          <div className="management-grid">
            <FormField
              label="Nome do produto"
              required
              maxLength={200}
              value={draft.nome}
              onChange={(e) => change('nome', e.target.value)}
            />
            <label className="form-field">
              Categoria
              <select
                aria-label="Categoria"
                className="form-select"
                value={draft.categoriaId ?? ''}
                onChange={(e) => change('categoriaId', e.target.value || undefined)}
              >
                <option value="">Por definir</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            Descrição
            <textarea
              className="form-control"
              maxLength={5000}
              rows={4}
              value={draft.descricao ?? ''}
              onChange={(e) => change('descricao', e.target.value || undefined)}
            />
          </label>
          <div className="management-grid">
            <FormField
              label="Preço de referência (€)"
              inputMode="decimal"
              pattern="[0-9]+([,.][0-9]{1,2})?"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              hint="Por 1 kg, 1 L, uma unidade ou uma embalagem, conforme a venda."
            />
            <FormField
              label="Modo de produção"
              maxLength={100}
              value={draft.modoProducao ?? ''}
              onChange={(e) => change('modoProducao', e.target.value || undefined)}
            />
          </div>
          <fieldset disabled={reserved}>
            <legend>Como vendes este produto</legend>
            <label className="form-field">
              Modalidade de venda
              <select
                aria-label="Modalidade de venda"
                className="form-select"
                value={unit?.modalidade ?? ''}
                onChange={(e) => {
                  const modalidade = e.target.value as NonNullable<typeof unit>['modalidade'];
                  change(
                    'unidadeVenda',
                    modalidade
                      ? {
                          modalidade,
                          unidadeBase:
                            modalidade === 'peso' ? 'g' : modalidade === 'volume' ? 'ml' : 'un',
                          quantidadeReferencia: ['peso', 'volume'].includes(modalidade) ? 1000 : 1,
                        }
                      : undefined,
                  );
                }}
              >
                <option value="">Por definir</option>
                <option value="peso">Peso · preço por kg, stock em g</option>
                <option value="volume">Volume · preço por L, stock em ml</option>
                <option value="unidade">Unidade</option>
                <option value="embalagem">Embalagem</option>
              </select>
            </label>
            {unit && (
              <>
                <div className="management-grid">
                  <FormField
                    label={'Quantidade mínima (' + measure + ')'}
                    type="number"
                    min={1}
                    step={1}
                    value={unit.quantidadeMinima ?? ''}
                    onChange={(e) =>
                      change('unidadeVenda', { ...unit, quantidadeMinima: number(e.target.value) })
                    }
                  />
                  <FormField
                    label={'Incremento de compra (' + measure + ')'}
                    type="number"
                    min={1}
                    step={1}
                    value={unit.incrementoCompra ?? ''}
                    onChange={(e) =>
                      change('unidadeVenda', { ...unit, incrementoCompra: number(e.target.value) })
                    }
                  />
                </div>
                <FormField
                  label="Descrição da unidade ou embalagem"
                  maxLength={120}
                  value={unit.rotulo ?? ''}
                  onChange={(e) =>
                    change('unidadeVenda', { ...unit, rotulo: e.target.value || undefined })
                  }
                />
                {['unidade', 'embalagem'].includes(unit.modalidade ?? '') && (
                  <div className="management-grid">
                    <FormField
                      label="Conteúdo de cada unidade ou embalagem (opcional)"
                      type="number"
                      min={1}
                      step={1}
                      value={unit.conteudoPorUnidade?.quantidade ?? ''}
                      onChange={(e) =>
                        change('unidadeVenda', {
                          ...unit,
                          conteudoPorUnidade: e.target.value
                            ? {
                                quantidade: Number(e.target.value),
                                unidade: unit.conteudoPorUnidade?.unidade ?? 'g',
                              }
                            : undefined,
                        })
                      }
                    />
                    <label className="form-field">
                      Medida do conteúdo
                      <select
                        aria-label="Medida do conteúdo"
                        className="form-select"
                        value={unit.conteudoPorUnidade?.unidade ?? 'g'}
                        onChange={(e) => {
                          if (unit.conteudoPorUnidade)
                            change('unidadeVenda', {
                              ...unit,
                              conteudoPorUnidade: {
                                ...unit.conteudoPorUnidade,
                                unidade: e.target.value as 'g' | 'ml' | 'un',
                              },
                            });
                        }}
                      >
                        <option value="g">Gramas</option>
                        <option value="ml">Mililitros</option>
                        <option value="un">Unidades</option>
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}
          </fieldset>
          <div className="management-grid">
            <FormField
              label={'Stock livre (' + measure + ')'}
              type="number"
              min={0}
              step={1}
              max={['unidade', 'embalagem'].includes(unit?.modalidade ?? '') ? 100000 : 10000000}
              value={draft.stockDisponivel ?? ''}
              onChange={(e) => change('stockDisponivel', number(e.target.value))}
              hint="Quantidade livre existente. A cesta não reserva stock; compras e leilões descontam-no no servidor."
            />
            <FormField
              label={'Limiar de alerta (' + measure + ', opcional)'}
              type="number"
              min={0}
              step={1}
              max={10000000}
              value={draft.limiarStockBaixo ?? ''}
              onChange={(e) => change('limiarStockBaixo', number(e.target.value))}
              hint="Deixa vazio para não definir alerta. Zero em stock é sempre indisponível."
            />
          </div>
          <fieldset>
            <legend>Existem ingredientes a declarar?</legend>
            {([true, false] as const).map((applicable) => (
              <label className="management-check" key={String(applicable)}>
                <input
                  type="radio"
                  name="ingredientes-aplicaveis"
                  checked={draft.ingredientesAplicaveis === applicable}
                  onChange={() => {
                    change('ingredientesAplicaveis', applicable);
                    if (!applicable) change('ingredientes', []);
                  }}
                />
                {applicable ? 'Sim, indicar ingredientes' : 'Não se aplicam ingredientes'}
              </label>
            ))}
          </fieldset>
          {draft.ingredientesAplicaveis && (
            <label className="form-field">
              Ingredientes (um por linha)
              <textarea
                className="form-control"
                rows={3}
                value={draft.ingredientes.join('\n')}
                onChange={(e) => change('ingredientes', e.target.value.split('\n'))}
                onBlur={() =>
                  change('ingredientes', draft.ingredientes.map((v) => v.trim()).filter(Boolean))
                }
              />
            </label>
          )}
          <label className="form-field">
            Etiquetas (uma por linha)
            <textarea
              className="form-control"
              rows={2}
              value={draft.etiquetas.join('\n')}
              onChange={(e) => change('etiquetas', e.target.value.split('\n'))}
              onBlur={() =>
                change('etiquetas', draft.etiquetas.map((v) => v.trim()).filter(Boolean))
              }
            />
          </label>
          <fieldset>
            <legend>Meses de época (opcional)</legend>
            <div className="management-months">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <label key={m}>
                  <input
                    type="checkbox"
                    checked={draft.epocaMeses?.includes(m) ?? false}
                    onChange={(e) =>
                      change(
                        'epocaMeses',
                        e.target.checked
                          ? [...(draft.epocaMeses ?? []), m].sort((a, b) => a - b)
                          : draft.epocaMeses?.filter((v) => v !== m),
                      )
                    }
                  />
                  {new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' }).format(
                    new Date(Date.UTC(2026, m - 1, 1)),
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          {product && (
            <label className="form-field">
              Estado de publicação
              <select
                aria-label="Estado de publicação"
                className="form-select"
                value={state}
                onChange={(e) => setState(e.target.value as typeof state)}
              >
                {Object.entries(publicationLabels)
                  .filter(([s]) => s !== 'arquivado' || immutable)
                  .map(([s, label]) => (
                    <option key={s} value={s}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <p>
            Para publicar: descrição, categoria, preço, unidade, mínimo, incremento, stock e pelo
            menos uma fotografia. A aprovação é confirmada pelo serviço.
          </p>
          <Button type="submit" disabled={mutation.busy || mutation.blocked || immutable}>
            {mutation.busy ? 'A guardar…' : product ? 'Guardar produto' : 'Criar rascunho'}
          </Button>
        </fieldset>
      </form>
      <section className="management-photos" aria-labelledby="management-photos-title">
        <h2 id="management-photos-title">Fotografias do produto</h2>
        <p>
          Até duas fotografias JPEG, PNG ou WebP, sem animação, até 5 MiB e 16 megapíxeis cada. O
          serviço confirma o formato e prepara a imagem.
        </p>
        {!product ? (
          <p>Cria primeiro o rascunho para associar as fotografias ao produto correto.</p>
        ) : (
          <>
            {dirty && <p>Guarda as alterações antes de enviar ou substituir fotografias.</p>}
            <div className="management-photo-grid">
              {draft.imagens.map((photo, index) => (
                <article key={photo.url}>
                  <ManagedPhoto photo={photo} />
                  <FormField
                    label={'Texto alternativo da fotografia ' + (index + 1)}
                    maxLength={500}
                    value={photo.alt ?? ''}
                    onChange={(e) =>
                      change(
                        'imagens',
                        draft.imagens.map((p, i) =>
                          i === index ? { ...p, alt: e.target.value || undefined } : p,
                        ),
                      )
                    }
                  />
                  <label className="management-check">
                    <input
                      type="radio"
                      name="principal"
                      checked={photo.principal === true}
                      disabled={immutable || mutation.busy || mutation.blocked}
                      onChange={() =>
                        change(
                          'imagens',
                          draft.imagens.map((p, i) => ({ ...p, principal: i === index })),
                        )
                      }
                    />
                    Fotografia principal
                  </label>
                  <Button
                    variant="text"
                    disabled={immutable || mutation.busy || mutation.blocked}
                    onClick={() =>
                      change(
                        'imagens',
                        draft.imagens
                          .filter((_, i) => i !== index)
                          .map((p, i) => ({ ...p, principal: i === 0 })),
                      )
                    }
                  >
                    Retirar fotografia {index + 1}
                  </Button>
                  <label className="form-field">
                    Substituir fotografia {index + 1}
                    <input
                      type="file"
                      className="form-control"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={dirty || mutation.busy || mutation.blocked || immutable}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void mutation.run(
                            '/me/products/' + product.id + '/images?substituir=' + index,
                            parseOwnProduct,
                            { method: 'POST', image: file, ifMatch: product.etag },
                            saved,
                          );
                        e.target.value = '';
                      }}
                    />
                  </label>
                </article>
              ))}
            </div>
            {draft.imagens.length < 2 && (
              <label className="form-field">
                Adicionar fotografia
                <input
                  type="file"
                  className="form-control"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={dirty || mutation.busy || mutation.blocked || immutable}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void mutation.run(
                        '/me/products/' + product.id + '/images',
                        parseOwnProduct,
                        { method: 'POST', image: file, ifMatch: product.etag },
                        saved,
                      );
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <p>
              Retirar, escolher a principal e editar o texto alternativo ficam confirmados ao
              guardar o produto.
            </p>
          </>
        )}
      </section>
      {product && !immutable && (
        <Button
          variant="secondary"
          disabled={mutation.busy || mutation.blocked}
          onClick={() => setRemove(true)}
        >
          Retirar produto de venda
        </Button>
      )}
      {remove && product && (
        <ConfirmationDialog
          open
          busy={mutation.busy}
          title="Arquivar este produto?"
          description="O produto deixa de estar à venda. Encomendas, lotes reservados e históricos são preservados; o arquivo não repõe stock nem cancela leilões."
          confirmLabel="Sim, arquivar produto"
          onClose={() => setRemove(false)}
          onConfirm={() =>
            void mutation.run(
              '/products/' + product.id,
              () => undefined,
              { method: 'DELETE', ifMatch: product.etag, expectedStatus: 204 },
              () => {
                setRemove(false);
                refresh();
              },
            )
          }
        />
      )}
    </>
  );
}
