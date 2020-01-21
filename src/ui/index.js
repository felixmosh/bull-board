import React from 'react'
import { render } from 'react-dom'
import './index.css'
import './xcode.css'
import App from './components/App'

render(<App basePath={window.basePath} />, document.getElementById('root'))
