import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import './styles/main.scss';
import { App } from './App';
import { demonstrationSite } from './features/auth/demo-mode';
import { CartProvider } from './features/cart/CartProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import { BuyerProvider } from './features/buyer/BuyerProvider';
import { AdminProvider } from './features/admin/AdminProvider';
import { ProducerProvider } from './features/producer/ProducerProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da aplicação não encontrado.');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={demonstrationSite ? '/demonstracao' : '/'}>
      <AuthProvider>
        <CartProvider>
          <BuyerProvider>
            <ProducerProvider>
              <AdminProvider>
                <App />
              </AdminProvider>
            </ProducerProvider>
          </BuyerProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
