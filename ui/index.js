import React from 'react'
import { render } from 'react-dom'
import './index.css'
import './xcode.css'
import App from './components/App'

const root = document.getElementById('root');
const basePath = root.dataset.basePath;

render(<App basePath={basePath} />, root)
