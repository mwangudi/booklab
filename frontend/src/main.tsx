import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initPwa } from './lib/pwa';
// Must load before the first render: the browser offers install only once, early.
import './lib/pwaInstall';

initPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
