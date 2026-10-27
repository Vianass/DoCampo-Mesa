import { publicProducerPath } from '../../../features/api/catalog';
import { Button } from '../../../components/Button';
import { MarketImage } from '../../../components/MarketImage';
import { ProducerMap } from '../../../components/ProducerMap';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ProducerProfileForm } from '../../../features/producer/ProducerProfileForm';
import { ProducerProductList } from '../../../features/producer/ProducerLists';
import { ownProducts } from '../../../features/producer/selectors';
export default function ProducerProfilePage({ preview = false }: { preview?: boolean }) {
  return (
    <ProducerPageFrame
      title={preview ? 'A tua origem, em perspetiva.' : 'O meu perfil público.'}
      description={
        preview
          ? 'Uma pré-visualização privada com os dados desta sessão. Nada foi publicado.'
          : 'As palavras que apresentam a tua produção e aproximam quem está do outro lado da mesa.'
      }
    >
      {(data) =>
        preview ? (
          <section className="producer-profile-preview">
            <MarketImage
              src={data.profile.coverImage.src}
              alt={data.profile.coverImage.alt}
              width="1200"
              height="600"
            />
            <p className="eyebrow">
              {data.profile.locality} · {data.profile.region}
            </p>
            <h2>{data.profile.name}</h2>
            <p>{data.profile.description || 'Descrição por preparar.'}</p>
            <ProducerMap locality={data.profile.locality} region={data.profile.region} />
            <h2>A produção neste cenário.</h2>
            <ProducerProductList products={ownProducts(data)} />
            {!ownProducts(data).length && <p>Sem produtos nesta pré-visualização.</p>}
            <div className="producer-actions">
              <Button to="/area/produtor/perfil" variant="secondary">
                Voltar à edição do perfil
              </Button>
              <Button to={publicProducerPath(data.producerId)} variant="text">
                Explorar os perfis públicos
              </Button>
            </div>
          </section>
        ) : (
          <section>
            <h2>As palavras da tua terra.</h2>
            <ProducerProfileForm key={data.producerId} profile={data.profile} />
          </section>
        )
      }
    </ProducerPageFrame>
  );
}
