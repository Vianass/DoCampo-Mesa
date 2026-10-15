import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ProducerFormErrors, ProducerSelect, ProducerTextarea } from './ProducerFields';
import { productDraft, producerCategories, producerUnits, validateProduct } from './selectors';
import { useProducer } from './useProducer';
import type { FieldErrors, ProductDraft, ProducerProduct } from './types';
export function ProducerProductForm({ product }: { product?: ProducerProduct }) {
  const [draft, setDraft] = useState(() => productDraft(product));
  const [errors, setErrors] = useState<FieldErrors<ProductDraft>>({});
  const [submitted, setSubmitted] = useState(false);
  const { saveProduct, feedback } = useProducer();
  function change(key: keyof ProductDraft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors({});
    setSubmitted(false);
  }
  return (
    <form
      className="producer-editor"
      noValidate
      aria-label={product ? 'Editar produto demonstrativo' : 'Criar produto demonstrativo'}
      onSubmit={(event) => {
        event.preventDefault();
        const next = validateProduct(draft);
        setErrors(next);
        if (!Object.keys(next).length) {
          saveProduct(draft, product?.id);
          setSubmitted(true);
        }
      }}
    >
      <ProducerFormErrors errors={errors} />
      <FormField
        label="Nome do produto"
        value={draft.name}
        required
        maxLength={120}
        error={errors.name}
        onChange={(event) => change('name', event.target.value)}
      />
      <ProducerTextarea
        label="Descrição (opcional)"
        rows={4}
        value={draft.description}
        maxLength={1000}
        error={errors.description}
        onChange={(event) => change('description', event.target.value)}
      />
      <div className="producer-form-grid">
        <ProducerSelect
          label="Categoria"
          value={draft.category}
          required
          error={errors.category}
          onChange={(event) => change('category', event.target.value)}
        >
          {producerCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Unidade comercial"
          value={draft.unit}
          required
          error={errors.unit}
          onChange={(event) => change('unit', event.target.value)}
        >
          {producerUnits.map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </ProducerSelect>
        <FormField
          label="Preço por unidade (€)"
          value={draft.price}
          inputMode="decimal"
          required
          error={errors.price}
          hint="EUR, até duas casas decimais. Zero é aceite apenas como pressuposto demonstrativo."
          onChange={(event) => change('price', event.target.value)}
        />
        <FormField
          label="Quantidade disponível"
          value={draft.stock}
          inputMode="numeric"
          required
          error={errors.stock}
          hint="Unidades comerciais inteiras; não reserva nem altera stock público."
          onChange={(event) => change('stock', event.target.value)}
        />
        <FormField
          label="Limiar de stock reduzido"
          value={draft.threshold}
          inputMode="numeric"
          required
          error={errors.threshold}
          hint="Regra provisória deste produto: alerta se 0 < stock ≤ limiar."
          onChange={(event) => change('threshold', event.target.value)}
        />
      </div>
      <p className="producer-help">
        A disponibilidade é calculada a partir da quantidade. Fotografias e certificação não são
        editáveis nesta demonstração. Um produto novo apresenta «Fotografia a preparar».
      </p>
      <div className="producer-actions">
        <Button type="submit" disabled={submitted && feedback?.kind === 'success'}>
          Guardar produto na demonstração
        </Button>
        <Button to="/area/produtor/produtos" variant="text">
          Voltar aos produtos
        </Button>
      </div>
    </form>
  );
}
