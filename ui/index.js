import React from 'react'
import { render } from 'react-dom'
import './components/index.css'
import App from './components/App'

render(<App basePath={window.basePath} />, document.getElementById('root'))
