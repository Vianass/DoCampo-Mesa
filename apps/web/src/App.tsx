import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { CatalogLoadingPage } from './features/catalog/CatalogLoadingPage';
import { DetailLoadingPage } from './features/market/DetailLoadingPage';
import { Container } from './components/Container';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { PublicLayout } from './layouts/PublicLayout';
import { HomePage } from './pages/HomePage';
import {
  AccountPlaceholderPage,
  AuctionDetailPage,
  AuctionsPage,
  DesignSystemPage,
  HowItWorksPage,
  NotFoundPage,
  ProducersPage,
} from './pages/MarketPages';

const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const ProducerDetailPage = lazy(() => import('./pages/ProducerDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="produtos"
          element={
            <Suspense fallback={<CatalogLoadingPage />}>
              <ProductsPage />
            </Suspense>
          }
        />
        <Route
          path="produtos/:id"
          element={
            <Suspense fallback={<DetailLoadingPage kind="product" />}>
              <ProductDetailPage />
            </Suspense>
          }
        />
        <Route path="produtores" element={<ProducersPage />} />
        <Route
          path="carrinho"
          element={
            <Suspense
              fallback={
                <Container>
                  <div className="cart-loading">
                    <LoadingSkeleton label="A carregar o carrinho" count={2} />
                  </div>
                </Container>
              }
            >
              <CartPage />
            </Suspense>
          }
        />
        <Route
          path="produtores/:id"
          element={
            <Suspense fallback={<DetailLoadingPage kind="producer" />}>
              <ProducerDetailPage />
            </Suspense>
          }
        />
        <Route path="leiloes" element={<AuctionsPage />} />
        <Route path="leiloes/:id" element={<AuctionDetailPage />} />
        <Route path="como-funciona" element={<HowItWorksPage />} />
        <Route path="entrar" element={<AccountPlaceholderPage />} />
        <Route path="registo" element={<AccountPlaceholderPage register />} />
        <Route path="sistema-visual" element={<DesignSystemPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
