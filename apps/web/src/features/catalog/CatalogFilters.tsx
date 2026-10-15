import { useId } from 'react';
import { formatPrice } from '../../data/market';
import { Icon } from '../../components/Icon';
import type { CatalogFilters as Filters, CatalogOptions } from './catalog';

interface Props {
  filters: Filters;
  options: CatalogOptions;
  activeCount: number;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K], replace?: boolean) => void;
  onClear: () => void;
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

export function CatalogFilters({ filters, options, activeCount, onChange, onClear }: Props) {
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
        options={options.categories.map((value) => ({ value, label: value }))}
        onChange={(value) =>
          onChange('category', options.categories.find((category) => category === value) ?? '')
        }
      />
      <FilterSelect
        id={`${id}-producer`}
        label="Produtor"
        value={filters.producerId}
        allLabel="Todos os produtores"
        options={options.producers.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(value) => onChange('producerId', value)}
      />
      <FilterSelect
        id={`${id}-location`}
        label="Localidade"
        value={filters.location}
        allLabel="Todas as localidades"
        options={options.locations.map((value) => ({ value, label: value }))}
        onChange={(value) => onChange('location', value)}
      />
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
        Produtos, origens e certificações são exemplos fictícios.
      </p>
    </div>
  );
}
