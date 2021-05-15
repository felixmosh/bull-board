import React from 'react';
import { render } from 'react-dom';

import './index.css';
import './theme.css';
import './toastify.css';
import { BrowserRouter } from 'react-router-dom';
import { App } from './components/App';
import { Api } from './services/Api';

const basePath =
  document.head.querySelector('base')?.getAttribute('href') || '';
const api = new Api({ basePath });

render(
  <BrowserRouter basename={basePath}>
    <App api={api} />
  </BrowserRouter>,
  document.getElementById('root')
);
