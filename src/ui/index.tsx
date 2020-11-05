import React from 'react'
import { render } from 'react-dom'

import './index.css'
import './theme.css'
import { App } from './components/App'

const basePath = document.head.querySelector('base')?.getAttribute('href') || ''

render(<App basePath={basePath} />, document.getElementById('root'))
