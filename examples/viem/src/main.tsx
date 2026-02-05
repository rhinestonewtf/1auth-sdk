import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Mount the React app to the DOM
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
