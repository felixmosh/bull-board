import React from 'react'
import { render } from 'react-dom'

import './index.css'
import './xcode.css'
import { App } from './components/App'

// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
const basePath = window.basePath

render(<App basePath={basePath} />, document.getElementById('root'))
