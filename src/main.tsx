import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const el = document.getElementById('root')
if (!el) throw new Error('root introuvable')

// Filet de sécurité : affiche les erreurs au lieu d'un écran noir.
window.addEventListener('error', (e) => {
  const div = document.createElement('pre')
  div.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:40%;overflow:auto;z-index:99;background:#3b0d0d;color:#ffd7d7;padding:12px;font:12px monospace'
  div.textContent = 'Erreur: ' + (e.message || e.error?.message || 'inconnue') + '\n' + (e.filename || '')
  document.body.appendChild(div)
})

createRoot(el).render(<App />)
