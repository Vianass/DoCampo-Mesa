import { useState, type ImgHTMLAttributes } from 'react';

const placeholder = '/images/product-placeholder.svg';

function ImageWithFallback({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      {...props}
      src={failed ? placeholder : src}
      alt={failed ? `Imagem indisponível. ${alt ?? ''}` : alt}
      onError={() => setFailed(true)}
    />
  );
}

export function MarketImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // A new source resets failure state, including navigation between products.
  return <ImageWithFallback key={props.src} {...props} />;
}
