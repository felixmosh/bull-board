import React from 'react';
import { render } from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { App } from './components/App';
import { ApiContext } from './hooks/useApi';
import './index.css';
import { Api } from './services/Api';
import './theme.css';
import './toastify.css';

const basePath = ((window as any).__basePath__ =
  document.head.querySelector('base')?.getAttribute('href') || '');
const api = new Api({ basePath });

render(
  <BrowserRouter basename={basePath}>
    <ApiContext.Provider value={api}>
      <App />
    </ApiContext.Provider>
  </BrowserRouter>,
  document.getElementById('root')
);
