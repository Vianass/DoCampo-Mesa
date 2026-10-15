import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { CatalogLoadingPage } from './features/catalog/CatalogLoadingPage';
import { DetailLoadingPage } from './features/market/DetailLoadingPage';
import { Container } from './components/Container';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { PublicLayout } from './layouts/PublicLayout';
import { PrivateLayout } from './layouts/PrivateLayout';
import { DemoRoute, PrivateIndex } from './features/private-area/DemoRoute';
import { roles } from './features/auth/types';
import {
  RoleLandingPage,
  PrivateSectionPage,
  PrivateNotFoundPage,
} from './pages/private/PrivatePages';
import { HomePage } from './pages/HomePage';
import {
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
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegistrationPage = lazy(() => import('./pages/auth/RegistrationPage'));
const RecoveryPage = lazy(() => import('./pages/auth/RecoveryPage'));

function AuthLoading() {
  return (
    <Container>
      <div className="auth-loading">
        <LoadingSkeleton label="A carregar o espaço de entrada" count={2} />
      </div>
    </Container>
  );
}

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
        <Route
          path="entrar"
          element={
            <Suspense fallback={<AuthLoading />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="registo"
          element={
            <Suspense fallback={<AuthLoading />}>
              <RegistrationPage />
            </Suspense>
          }
        />
        <Route
          path="recuperar-palavra-passe"
          element={
            <Suspense fallback={<AuthLoading />}>
              <RecoveryPage />
            </Suspense>
          }
        />
        <Route path="sistema-visual" element={<DesignSystemPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="area" element={<DemoRoute />}>
        <Route element={<PrivateLayout />}>
          <Route index element={<PrivateIndex />} />
          {roles.map((role) => (
            <Route key={role} path={role} element={<DemoRoute role={role} />}>
              <Route index element={<RoleLandingPage role={role} />} />
              <Route path=":section" element={<PrivateSectionPage role={role} />} />
              <Route path="*" element={<PrivateNotFoundPage home={`/area/${role}`} />} />
            </Route>
          ))}
          <Route path="*" element={<PrivateNotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
