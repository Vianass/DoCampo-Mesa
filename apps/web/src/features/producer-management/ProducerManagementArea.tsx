import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { EmptyState } from '../../components/EmptyState';
import { PriceDisplay } from '../../components/PriceDisplay';
import { categories, objectId } from '../api/catalog-contract';
import { id, record, number, text } from '../auctions/contracts';
import { InvalidResponse } from '../api/catalog-contract';
import { ProductForm } from './ProductForm';
import { ProfileForm } from './ProfileForm';
import { ManagementFrame, ManagementState, ManagedPhoto } from './ManagementComponents';
import {
  parseOwnProduct,
  parseOwnProducts,
  parseProfile,
  stockState,
  publicationLabels,
} from './contracts';
import { useManagement } from './useManagement';
function ProductList() {
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const k of ['pesquisa', 'categoria', 'stock', 'estado', 'pagina', 'ordem'])
    if (params.get(k)) query.set(k, params.get(k)!);
  const resource = useManagement('/me/products?' + query, parseOwnProducts);
  function change(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'pagina') next.delete('pagina');
    setParams(next, { replace: k === 'pesquisa' });
  }
  return (
    <ManagementFrame title="Os meus produtos.">
      <div className="producer-actions">
        <Button to="/area/produtor/produtos/novo">Criar produto</Button>
        <Button variant="secondary" to="/area/produtor/perfil">
          Perfil e condições da loja
        </Button>
      </div>
      <div className="management-grid">
        <FormField
          label="Pesquisar os meus produtos"
          type="search"
          maxLength={100}
          value={params.get('pesquisa') ?? ''}
          onChange={(e) => change('pesquisa', e.target.value)}
        />
        <label className="form-field">
          Estado do produto
          <select
            aria-label="Estado do produto"
            className="form-select"
            value={params.get('estado') ?? ''}
            onChange={(e) => change('estado', e.target.value)}
          >
            <option value="">Todos os estados</option>
            {Object.entries(publicationLabels).map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Situação de stock
          <select
            aria-label="Situação de stock"
            className="form-select"
            value={params.get('stock') ?? ''}
            onChange={(e) => change('stock', e.target.value)}
          >
            <option value="">Todo o stock</option>
            <option value="baixo">Stock reduzido</option>
            <option value="esgotado">Indisponível</option>
            <option value="disponivel">Disponível</option>
          </select>
        </label>
        <label className="form-field">
          Categoria
          <select
            aria-label="Categoria"
            className="form-select"
            value={params.get('categoria') ?? ''}
            onChange={(e) => change('categoria', e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Ordenar produtos
          <select
            aria-label="Ordenar produtos"
            className="form-select"
            value={params.get('ordem') ?? 'nome-asc'}
            onChange={(e) => change('ordem', e.target.value)}
          >
            <option value="nome-asc">Nome A–Z</option>
            <option value="nome-desc">Nome Z–A</option>
            <option value="preco-asc">Preço crescente</option>
            <option value="preco-desc">Preço decrescente</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </label>
      </div>
      <ManagementState {...resource} retry={resource.refresh} />
      {resource.data && (
        <>
          <p role="status">
            {resource.data.total} {resource.data.total === 1 ? 'produto' : 'produtos'} na tua
            produção com estes filtros.
          </p>
          {resource.data.itens.length ? (
            <div className="management-product-list">
              {resource.data.itens.map((p) => (
                <article key={p.id}>
                  {p.imagens[0] && <ManagedPhoto photo={p.imagens[0]} />}
                  <div className="management-product-content">
                    <p className="eyebrow">{publicationLabels[p.estadoPublicacao]}</p>
                    <h2>{p.nome}</h2>
                    <p>
                      {stockState(p)} · {p.stockDisponivel ?? 'Por definir'}{' '}
                      {p.unidadeVenda?.unidadeBase ?? ''} livres
                    </p>
                    {p.precoCent !== undefined && (
                      <PriceDisplay
                        amountCents={p.precoCent}
                        unit={
                          p.unidadeVenda?.modalidade === 'peso'
                            ? 'kg'
                            : p.unidadeVenda?.modalidade === 'volume'
                              ? 'L'
                              : p.unidadeVenda?.modalidade
                        }
                      />
                    )}
                    <Button to={'/area/produtor/produtos/' + p.id + '/editar'} variant="secondary">
                      Gerir {p.nome}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sem produtos para esta escolha."
              description="Cria um rascunho ou limpa os filtros. Os produtos arquivados continuam no histórico."
              action={
                <Button onClick={() => setParams({})} variant="secondary">
                  Limpar filtros
                </Button>
              }
            />
          )}
          {resource.data.totalPaginas > 1 && (
            <nav className="management-pagination" aria-label="Paginação dos teus produtos">
              <Button
                variant="secondary"
                disabled={resource.data.pagina <= 1}
                onClick={() => change('pagina', String(resource.data!.pagina - 1))}
              >
                Página anterior
              </Button>
              <p>
                {resource.data.pagina} / {resource.data.totalPaginas}
              </p>
              <Button
                variant="secondary"
                disabled={resource.data.pagina >= resource.data.totalPaginas}
                onClick={() => change('pagina', String(resource.data!.pagina + 1))}
              >
                Página seguinte
              </Button>
            </nav>
          )}
        </>
      )}
    </ManagementFrame>
  );
}
function ProductDetail({ productId }: { productId: string }) {
  const resource = useManagement('/me/products/' + productId, parseOwnProduct, false),
    [notice, setNotice] = useState(''),
    feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) feedback.current?.focus();
  }, [notice]);
  return (
    <ManagementFrame title="Cuidar de cada produto.">
      <p>
        <Link to="/area/produtor/produtos">← Voltar aos meus produtos</Link>
      </p>
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      <ManagementState {...resource} retry={resource.refresh} />
      {resource.data && (
        <ProductForm
          key={resource.data.etag}
          product={resource.data}
          refresh={resource.refresh}
          saved={() => {
            setNotice('Produto guardado e confirmado pelo serviço.');
            resource.refresh();
          }}
        />
      )}
    </ManagementFrame>
  );
}
function OwnProfile() {
  const resource = useManagement('/me/producer', parseProfile, false),
    [notice, setNotice] = useState(''),
    feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) feedback.current?.focus();
  }, [notice]);
  return (
    <ManagementFrame title="A tua origem, com as tuas palavras.">
      {notice && (
        <p ref={feedback} role="status" tabIndex={-1}>
          {notice}
        </p>
      )}
      <ManagementState {...resource} retry={resource.refresh} />
      {resource.data && (
        <ProfileForm
          key={resource.data.etag}
          profile={resource.data}
          refresh={resource.refresh}
          saved={() => {
            setNotice('Perfil e condições guardados e confirmados pelo serviço.');
            resource.refresh();
          }}
        />
      )}
    </ManagementFrame>
  );
}
export default function ProducerManagementArea() {
  const path = useLocation().pathname.split('/'),
    navigate = useNavigate();
  if (path[3] === 'perfil') return <OwnProfile />;
  if (!path[4]) return <ProductList />;
  if (path[4] === 'novo')
    return (
      <ManagementFrame title="Uma nova escolha.">
        <ProductForm
          refresh={() => navigate('/area/produtor/produtos')}
          saved={(p) => navigate('/area/produtor/produtos/' + p.id + '/editar')}
        />
      </ManagementFrame>
    );
  if (!objectId(path[4]))
    return (
      <ManagementFrame title="Este produto não está disponível.">
        <Button to="/area/produtor/produtos">Voltar aos produtos</Button>
      </ManagementFrame>
    );
  return <ProductDetail key={id(path[4])} productId={path[4]} />;
}
function parseIndicators(v: unknown) {
  const r = record(v);
  if (!Array.isArray(r.avaliacoes)) throw new InvalidResponse();
  return {
    produtos: number(r.produtos),
    publicados: number(r.publicados),
    semStock: number(r.semStock),
    stockBaixo: number(r.stockBaixo),
    avaliacoes: r.avaliacoes.map((v) => {
      const x = record(v),
        alvoTipo = text(x.alvoTipo);
      if (
        !['produto', 'produtor'].includes(alvoTipo) ||
        !(
          x.media === null ||
          (typeof x.media === 'number' && Number.isFinite(x.media) && x.media >= 1 && x.media <= 5)
        )
      )
        throw new InvalidResponse();
      return { alvoTipo, total: number(x.total), media: x.media as number | null };
    }),
  };
}
export function ProducerInventorySummary() {
  const resource = useManagement('/me/producer/indicators', parseIndicators);
  return (
    <section className="producer-management management-summary">
      <h2>Produtos, stock e avaliações</h2>
      {resource.loading && <p role="status">A consultar os indicadores da produção…</p>}
      {resource.error && (
        <p>
          Não foi possível consultar estes indicadores.{' '}
          <Button variant="text" onClick={resource.refresh}>
            Atualizar indicadores de produção
          </Button>
        </p>
      )}
      {resource.data && (
        <>
          <dl className="producer-inventory-metrics">
            <div>
              <dt>Produtos não arquivados</dt>
              <dd>{resource.data.produtos}</dd>
            </div>
            <div>
              <dt>Produtos publicados</dt>
              <dd>{resource.data.publicados}</dd>
            </div>
            <div>
              <dt>
                <Link to="/area/produtor/produtos?stock=baixo">Produtos com stock reduzido</Link>
              </dt>
              <dd>{resource.data.stockBaixo}</dd>
            </div>
            <div>
              <dt>
                <Link to="/area/produtor/produtos?stock=esgotado">Produtos indisponíveis</Link>
              </dt>
              <dd>{resource.data.semStock}</dd>
            </div>
          </dl>
          <p>
            Stock reduzido: quantidade livre positiva até ao limiar escolhido no produto. Zero é
            indisponível; um produto sem limiar não gera um alerta de stock reduzido.
          </p>
          <div className="management-grid">
            {resource.data.avaliacoes.map((r) => (
              <div key={r.alvoTipo}>
                <h3>
                  {r.alvoTipo === 'produtor' ? 'Avaliações do produtor' : 'Avaliações dos produtos'}
                </h3>
                <p>
                  {r.total} avaliações públicas ·{' '}
                  {r.media === null
                    ? 'Ainda sem média'
                    : r.media.toLocaleString('pt-PT', { maximumFractionDigits: 2 }) + ' / 5'}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="producer-actions">
        <Button to="/area/produtor/produtos" variant="secondary">
          Gerir produtos e stock
        </Button>
        <Button to="/area/produtor/perfil" variant="text">
          Editar perfil e condições
        </Button>
      </div>
    </section>
  );
}
