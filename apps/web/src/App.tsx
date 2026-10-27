import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { CatalogLoadingPage } from './features/catalog/CatalogLoadingPage';
import { DetailLoadingPage } from './features/market/DetailLoadingPage';
import { Container } from './components/Container';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { PublicLayout } from './layouts/PublicLayout';
import { PrivateLayout } from './layouts/PrivateLayout';
import { DemoRoute, PrivateIndex } from './features/private-area/DemoRoute';
import { BuyerArea, BuyerLoading } from './features/buyer/BuyerPageFrame';
import { ProducerArea, ProducerLoading } from './features/producer/ProducerPageFrame';
import { PrivateNotFoundPage } from './pages/private/PrivatePages';
import { AdminArea, AdminLoading } from './features/admin/AdminPageFrame';
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
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegistrationPage = lazy(() => import('./pages/auth/RegistrationPage'));
const RecoveryPage = lazy(() => import('./pages/auth/RecoveryPage'));
const BuyerDashboardPage = lazy(() => import('./pages/private/buyer/BuyerDashboardPage'));
const BuyerOrdersPage = lazy(() => import('./pages/private/buyer/BuyerOrdersPage'));
const BuyerOrderDetailPage = lazy(() => import('./pages/private/buyer/BuyerOrderDetailPage'));
const BuyerReviewsPage = lazy(() => import('./pages/private/buyer/BuyerReviewsPage'));
const BuyerBidsPage = lazy(() => import('./pages/private/buyer/BuyerBidsPage'));
const BuyerAuctionPage = lazy(() => import('./pages/private/buyer/BuyerAuctionPage'));
const ProducerDashboardPage = lazy(() => import('./pages/private/producer/ProducerDashboardPage'));
const ProducerApplicationPage = lazy(
  () => import('./pages/private/producer/ProducerApplicationPage'),
);
const ProducerProductsPage = lazy(() => import('./pages/private/producer/ProducerProductsPage'));
const ProducerProductPage = lazy(() => import('./pages/private/producer/ProducerProductPage'));
const ProducerProfilePage = lazy(() => import('./pages/private/producer/ProducerProfilePage'));
const ProducerOrdersPage = lazy(() => import('./pages/private/producer/ProducerOrdersPage'));
const ProducerOrderDetailPage = lazy(
  () => import('./pages/private/producer/ProducerOrderDetailPage'),
);
const ProducerAuctionsPage = lazy(() => import('./pages/private/producer/ProducerAuctionsPage'));
const ProducerAuctionDetailPage = lazy(
  () => import('./pages/private/producer/ProducerAuctionDetailPage'),
);
const ProducerStockPage = lazy(() => import('./pages/private/producer/ProducerStockPage'));
const AdminDashboardPage = lazy(() => import('./pages/private/admin/AdminDashboardPage'));
const AdminProducersPage = lazy(() => import('./pages/private/admin/AdminProducersPage'));
const AdminUsersPage = lazy(() => import('./pages/private/admin/AdminUsersPage'));
const AdminOrdersPage = lazy(() => import('./pages/private/admin/AdminOrdersPage'));
const AdminModerationPage = lazy(() => import('./pages/private/admin/AdminModerationPage'));
const AdminAuctionsPage = lazy(() => import('./pages/private/admin/AdminAuctionsPage'));
const AdminServicesPage = lazy(() => import('./pages/private/admin/AdminServicesPage'));
function adminPage(page: ReactNode) {
  return <Suspense fallback={<AdminLoading />}>{page}</Suspense>;
}

function producerPage(page: ReactNode) {
  return <Suspense fallback={<ProducerLoading />}>{page}</Suspense>;
}

function buyerPage(page: ReactNode) {
  return <Suspense fallback={<BuyerLoading />}>{page}</Suspense>;
}

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
        <Route
          path="checkout/*"
          element={
            <Suspense fallback={<AuthLoading />}>
              <CheckoutPage />
            </Suspense>
          }
        />
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
          <Route path="comprador" element={<DemoRoute role="comprador" />}>
            <Route element={<BuyerArea />}>
              <Route index element={buyerPage(<BuyerDashboardPage />)} />
              <Route path="encomendas" element={buyerPage(<BuyerOrdersPage />)} />
              <Route path="encomendas/:id" element={buyerPage(<BuyerOrderDetailPage />)} />
              <Route path="avaliacoes" element={buyerPage(<BuyerReviewsPage />)} />
              <Route path="licitacoes" element={buyerPage(<BuyerBidsPage />)} />
              <Route path="licitacoes/:id" element={buyerPage(<BuyerAuctionPage />)} />
              <Route path="*" element={<PrivateNotFoundPage home="/area/comprador" />} />
            </Route>
          </Route>
          <Route path="produtor" element={<DemoRoute role="produtor" />}>
            <Route element={<ProducerArea />}>
              <Route index element={producerPage(<ProducerDashboardPage />)} />
              <Route path="candidatura" element={producerPage(<ProducerApplicationPage />)} />
              <Route path="produtos" element={producerPage(<ProducerProductsPage />)} />
              <Route
                path="produtos/novo"
                element={producerPage(<ProducerProductPage mode="new" />)}
              />
              <Route path="produtos/:id" element={producerPage(<ProducerProductPage />)} />
              <Route
                path="produtos/:id/editar"
                element={producerPage(<ProducerProductPage mode="edit" />)}
              />
              <Route path="perfil" element={producerPage(<ProducerProfilePage />)} />
              <Route
                path="perfil/pre-visualizacao"
                element={producerPage(<ProducerProfilePage preview />)}
              />
              <Route path="encomendas" element={producerPage(<ProducerOrdersPage />)} />
              <Route path="encomendas/:id" element={producerPage(<ProducerOrderDetailPage />)} />
              <Route path="leiloes" element={producerPage(<ProducerAuctionsPage />)} />
              <Route path="leiloes/:id" element={producerPage(<ProducerAuctionDetailPage />)} />
              <Route path="indicadores" element={producerPage(<ProducerStockPage />)} />
              <Route path="*" element={<PrivateNotFoundPage home="/area/produtor" />} />
            </Route>
          </Route>
          <Route path="administrador" element={<DemoRoute role="administrador" />}>
            <Route element={<AdminArea />}>
              <Route index element={adminPage(<AdminDashboardPage />)} />
              <Route path="candidaturas" element={adminPage(<AdminProducersPage applications />)} />
              <Route
                path="candidaturas/:id"
                element={adminPage(<AdminProducersPage applications detail />)}
              />
              <Route path="produtores" element={adminPage(<AdminProducersPage />)} />
              <Route path="produtores/:id" element={adminPage(<AdminProducersPage detail />)} />
              <Route path="utilizadores" element={adminPage(<AdminUsersPage />)} />
              <Route path="utilizadores/:id" element={adminPage(<AdminUsersPage detail />)} />
              <Route path="encomendas" element={adminPage(<AdminOrdersPage />)} />
              <Route path="encomendas/:id" element={adminPage(<AdminOrdersPage detail />)} />
              <Route path="moderacao" element={adminPage(<AdminModerationPage />)} />
              <Route path="moderacao/:id" element={adminPage(<AdminModerationPage detail />)} />
              <Route path="leiloes" element={adminPage(<AdminAuctionsPage />)} />
              <Route path="leiloes/:id" element={adminPage(<AdminAuctionsPage detail />)} />
              <Route path="servicos" element={adminPage(<AdminServicesPage />)} />
              <Route path="*" element={<PrivateNotFoundPage home="/area/administrador" />} />
            </Route>
          </Route>
          <Route path="*" element={<PrivateNotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
