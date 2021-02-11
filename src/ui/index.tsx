import React from 'react'
import { render } from 'react-dom'

import './index.css'
import './theme.css'
import './toastify.css'
import { App } from './components/App'
import { Api } from './services/Api'

const basePath = document.head.querySelector('base')?.getAttribute('href') || ''
const api = new Api({ basePath })

render(<App basePath={basePath} api={api} />, document.getElementById('root'))
