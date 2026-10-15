import { useParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProductGallery } from '../../../components/ProductGallery';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerProductForm } from '../../../features/producer/ProducerProductForm';
import { StockStatus } from '../../../features/producer/ProducerLists';
import { selectProducerProduct } from '../../../features/producer/selectors';
export default function ProducerProductPage({
  mode = 'detail',
}: {
  mode?: 'detail' | 'edit' | 'new';
}) {
  const { id } = useParams();
  return (
    <ProducerPageFrame
      title={
        mode === 'new'
          ? 'Uma nova escolha.'
          : mode === 'edit'
            ? 'Cuidar dos detalhes.'
            : 'Da origem ao produto.'
      }
      description="Uma apresentação privada e demonstrativa, sem alterações ao catálogo público."
    >
      {(data) => {
        const product = selectProducerProduct(data, id);
        if (mode !== 'new' && !product)
          return (
            <EmptyState
              title="Este produto não está na tua produção."
              description="O identificador não existe neste cenário ou pertence a outro produtor."
              action={<Button to="/area/produtor/produtos">Voltar aos produtos</Button>}
            />
          );
        if (mode === 'new' || mode === 'edit')
          return (
            <section>
              <h2>{mode === 'new' ? 'Preparar um produto demonstrativo.' : product?.name}</h2>
              <ProducerProductForm key={id ?? 'new'} product={product ?? undefined} />
            </section>
          );
        if (!product) return null;
        return (
          <section className="producer-product-detail">
            <div className="producer-product-detail__gallery">
              <ProductGallery key={product.id} images={product.images} productName={product.name} />
            </div>
            <div>
              <p className="eyebrow">{product.category}</p>
              <h2>{product.name}</h2>
              <p>{product.description || 'Descrição ainda por preparar.'}</p>
              <PriceDisplay amountCents={product.priceCents} unit={product.unit} large />
              <StockStatus product={product} />
              <dl className="producer-facts">
                <div>
                  <dt>Quantidade disponível</dt>
                  <dd>
                    {product.availableStock} unidades comerciais · {product.unit}
                  </dd>
                </div>
                <div>
                  <dt>Limiar ilustrativo de stock reduzido</dt>
                  <dd>{product.lowStockThreshold} unidades</dd>
                </div>
              </dl>
              <div className="producer-actions">
                <Button to={'/area/produtor/produtos/' + product.id + '/editar'}>
                  Editar este produto
                </Button>
                <Button to="/area/produtor/produtos" variant="text">
                  Voltar aos produtos
                </Button>
              </div>
            </div>
          </section>
        );
      }}
    </ProducerPageFrame>
  );
}
