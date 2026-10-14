import { Route, Routes } from 'react-router';
import { PublicLayout } from './layouts/PublicLayout';
import { HomePage } from './pages/HomePage';
import {
  AccountPlaceholderPage,
  AuctionDetailPage,
  AuctionsPage,
  DesignSystemPage,
  HowItWorksPage,
  NotFoundPage,
  ProducerDetailPage,
  ProducersPage,
  ProductDetailPage,
  ProductsPage,
} from './pages/MarketPages';

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="produtos/:id" element={<ProductDetailPage />} />
        <Route path="produtores" element={<ProducersPage />} />
        <Route path="produtores/:id" element={<ProducerDetailPage />} />
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
