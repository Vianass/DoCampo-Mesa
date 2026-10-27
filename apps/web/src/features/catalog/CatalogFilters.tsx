import { useId } from 'react';
import { formatPrice } from '../../data/market';
import { Icon } from '../../components/Icon';
import type { CatalogFilters as Filters, CatalogOptions } from './catalog';
import type { useCatalog } from './useCatalog';

interface Props {
  filters: Filters;
  options: CatalogOptions;
  activeCount: number;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K], replace?: boolean) => void;
  onClear: () => void;
  producerPicker?: ReturnType<typeof useCatalog>;
}
interface SelectProps {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}
function FilterSelect({ id, label, value, allLabel, options, onChange }: SelectProps) {
  return (
    <div className="catalog-filter-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CatalogFilters({
  filters,
  options,
  activeCount,
  onChange,
  onClear,
  producerPicker,
}: Props) {
  const id = useId();
  return (
    <div className="catalog-filters">
      <div className="catalog-filters__heading">
        <h2>Filtrar produtos</h2>
        <button type="button" onClick={onClear} disabled={!activeCount} className="catalog-clear">
          Limpar filtros
        </button>
      </div>
      <FilterSelect
        id={`${id}-category`}
        label="Categoria"
        value={filters.category}
        allLabel="Todas as categorias"
        options={options.categories.map((name) => ({
          value: options.categoryIds?.[name] ?? name,
          label: name,
        }))}
        onChange={(value) => onChange('category', value as Filters['category'])}
      />
      {producerPicker && (
        <div className="catalog-filter-field">
          <label className="form-label" htmlFor={`${id}-producer-search`}>
            Pesquisar produtor
          </label>
          <input
            className="form-control"
            id={`${id}-producer-search`}
            type="search"
            value={producerPicker.producerSearch}
            maxLength={100}
            onChange={(e) => producerPicker.setProducerSearch(e.target.value)}
          />
          <p>Pesquisa os perfis públicos para escolher a origem.</p>
          {producerPicker.producerLoading && <p role="status">A carregar produtores…</p>}
          {producerPicker.producerError && (
            <p role="alert">
              Não foi possível consultar os produtores.{' '}
              <button
                type="button"
                className="catalog-clear"
                onClick={producerPicker.producerRetry}
              >
                Tentar novamente
              </button>
            </p>
          )}
        </div>
      )}
      <FilterSelect
        id={`${id}-producer`}
        label="Produtor"
        value={filters.producerId}
        allLabel="Todos os produtores"
        options={[
          ...(filters.producerId && !options.producers.some((p) => p.id === filters.producerId)
            ? [{ value: filters.producerId, label: 'Produtor selecionado · ' + filters.producerId }]
            : []),
          ...options.producers.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={(value) => onChange('producerId', value)}
      />
      {producerPicker && producerPicker.producerPages > 1 && (
        <div className="showcase-row">
          <button
            className="catalog-clear"
            type="button"
            disabled={producerPicker.producerPage <= 1}
            onClick={() => producerPicker.setProducerPage(producerPicker.producerPage - 1)}
          >
            Produtores anteriores
          </button>
          <span>
            {producerPicker.producerPage} / {producerPicker.producerPages}
          </span>
          <button
            className="catalog-clear"
            type="button"
            disabled={producerPicker.producerPage >= producerPicker.producerPages}
            onClick={() => producerPicker.setProducerPage(producerPicker.producerPage + 1)}
          >
            Mais produtores
          </button>
        </div>
      )}
      <div className="catalog-filter-field">
        <label className="form-label" htmlFor={`${id}-location`}>
          Localidade
        </label>
        <input
          className="form-control"
          id={`${id}-location`}
          type="search"
          maxLength={120}
          value={filters.location}
          placeholder="Todas as localidades"
          onChange={(e) => onChange('location', e.target.value, true)}
        />
        <p>Nome exato da localidade, sem distinguir acentos.</p>
      </div>
      <div className="catalog-filter-field">
        <label className="form-label" htmlFor={`${id}-mode`}>
          Modo de produção
        </label>
        <input
          className="form-control"
          id={`${id}-mode`}
          type="search"
          maxLength={100}
          value={filters.productionMode ?? ''}
          placeholder="Todos os modos"
          onChange={(e) => onChange('productionMode', e.target.value, true)}
        />
        <p>Declaração do produtor, sem certificação verificada.</p>
      </div>
      <FilterSelect
        id={`${id}-season`}
        label="Época"
        value={filters.season}
        allLabel="Todas as épocas"
        options={options.seasons.map((value) => ({ value, label: value }))}
        onChange={(value) =>
          onChange('season', options.seasons.find((season) => season === value) ?? '')
        }
      />
      <div className="catalog-filter-price">
        <label className="form-label" htmlFor={`${id}-price`}>
          Preço máximo
        </label>
        <output htmlFor={`${id}-price`}>
          {formatPrice(filters.maxPriceCents ?? options.priceCeilingCents)}
        </output>
        <input
          id={`${id}-price`}
          className="form-range"
          type="range"
          min="0"
          max={options.priceCeilingCents}
          step="5"
          value={filters.maxPriceCents ?? options.priceCeilingCents}
          aria-valuetext={formatPrice(filters.maxPriceCents ?? options.priceCeilingCents)}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange('maxPriceCents', value < options.priceCeilingCents ? value : null, true);
          }}
        />
        <div className="catalog-filter-price__limits">
          <span>{formatPrice(0)}</span>
          <span>{formatPrice(options.priceCeilingCents)}</span>
        </div>
        <p>Preço por unidade indicada no produto.</p>
      </div>
      <div className="catalog-filter-organic">
        <input
          id={`${id}-organic`}
          className="form-check-input"
          type="checkbox"
          checked={filters.organicOnly}
          onChange={(event) => onChange('organicOnly', event.target.checked)}
        />
        <label htmlFor={`${id}-organic`}>
          <Icon name="leaf" />
          Só produção biológica<span>Seleciona os produtos assinalados como biológicos.</span>
        </label>
      </div>
      <p className="catalog-filters__note">
        Dados públicos do catálogo. A indicação biológica é declarada pelo produtor; não comprova
        certificação.
      </p>
    </div>
  );
}
