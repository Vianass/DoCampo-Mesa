import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { FormField } from '../../../components/FormField';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerProductList } from '../../../features/producer/ProducerLists';
import { ProducerSelect } from '../../../features/producer/ProducerFields';
import {
  productOptions,
  producerCategories,
  selectProducerProducts,
} from '../../../features/producer/selectors';
export default function ProducerProductsPage() {
  const [params, setParams] = useSearchParams();
  const options = productOptions(params);
  const [pending, setPending] = useState<{ source: URLSearchParams; search: string } | null>(null);
  const waiting = pending?.source === params;
  if (pending && !waiting) setPending(null);
  const search = pending && waiting ? pending.search : options.search;
  function change(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (!value || value === 'todos') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace });
  }
  return (
    <ProducerPageFrame
      title="Os meus produtos."
      description="Nome, preço e disponibilidade: os detalhes que dão forma à tua produção."
    >
      {(data) => {
        const items = selectProducerProducts(data, options);
        return (
          <>
            <div className="producer-section-heading">
              <h2>O teu catálogo, com cuidado.</h2>
              <Button to="/area/produtor/produtos/novo">Criar produto demonstrativo</Button>
            </div>
            <div className="producer-filters">
              <FormField
                label="Pesquisar os meus produtos"
                type="search"
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setPending({ source: params, search: event.target.value });
                  change('pesquisa', event.target.value, true);
                }}
              />
              <ProducerSelect
                label="Categoria dos produtos"
                value={options.category}
                onChange={(event) => change('categoria', event.target.value)}
              >
                <option value="">Todas as categorias</option>
                {producerCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </ProducerSelect>
              <ProducerSelect
                label="Disponibilidade dos produtos"
                value={options.stock}
                onChange={(event) => change('stock', event.target.value)}
              >
                <option value="todos">Todas as disponibilidades</option>
                <option value="disponivel">Disponível</option>
                <option value="reduzido">Stock reduzido</option>
                <option value="indisponivel">Indisponível</option>
              </ProducerSelect>
            </div>
            <p className="producer-result-count" role="status">
              {items.length} produtos neste percurso
            </p>
            {items.length ? (
              <section aria-labelledby="producer-products-title">
                <h2 id="producer-products-title" className="visually-hidden">
                  Lista dos produtos demonstrativos
                </h2>
                <ProducerProductList products={items} />
              </section>
            ) : (
              <EmptyState
                title="Sem produtos para esta escolha."
                description="Limpa os filtros ou prepara um novo exemplo de produto."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      ['pesquisa', 'categoria', 'stock'].forEach((key) => next.delete(key));
                      setPending(null);
                      setParams(next);
                    }}
                  >
                    Limpar filtros
                  </Button>
                }
              />
            )}
          </>
        );
      }}
    </ProducerPageFrame>
  );
}
