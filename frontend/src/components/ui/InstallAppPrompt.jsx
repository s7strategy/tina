import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { Download, Share2, X } from 'lucide-react'

function storageKey(userId) {
  return userId ? `tina_pwa_install_hint_v1_${userId}` : 'tina_pwa_install_hint_v1'
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  )
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function InstallAppPrompt() {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [deferred, setDeferred] = useState(null)

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault()
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const tryShow = useCallback(() => {
    if (loading || !isAuthenticated) return
    if (location.pathname === '/login' || location.pathname === '/register') return
    if (isStandalone()) return
    try {
      if (localStorage.getItem(storageKey(user?.id)) === '1') return
    } catch {
      /* ignore */
    }
    setOpen(true)
  }, [loading, isAuthenticated, location.pathname, user?.id])

  useEffect(() => {
    const t = window.setTimeout(tryShow, 600)
    return () => window.clearTimeout(t)
  }, [tryShow])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey(user?.id), '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [user?.id])

  async function installChrome() {
    if (!deferred) return
    try {
      deferred.prompt()
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
    dismiss()
  }

  if (!open) return null

  return (
    <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <div className="pwa-install-card">
        <button type="button" className="pwa-install-close" onClick={dismiss} aria-label="Fechar">
          <X size={22} strokeWidth={2} />
        </button>
        <div className="pwa-install-icon-wrap">
          <img src="/favicon.png" alt="" width={72} height={72} className="pwa-install-icon" decoding="async" />
        </div>
        <h2 id="pwa-install-title" className="pwa-install-title">
          Baixar app
        </h2>
        <p className="pwa-install-lead">
          Adicione o TINA ao ecrã inicial como uma aplicação — abre direto no site, ao lado das tuas outras apps.
        </p>

        {deferred ? (
          <button type="button" className="pwa-install-primary" onClick={installChrome}>
            <Download size={20} strokeWidth={2.25} aria-hidden />
            Instalar / adicionar ao ecrã
          </button>
        ) : null}

        {isIos() ? (
          <div className="pwa-install-steps">
            <p className="pwa-install-steps-title">
              <Share2 size={18} strokeWidth={2.25} aria-hidden /> No Safari (iPhone / iPad)
            </p>
            <ol>
              <li>Toca no botão <strong>Partilhar</strong> na barra inferior.</li>
              <li>Escolhe <strong>Adicionar ao Ecrã Principal</strong>.</li>
              <li>Confirma — o ícone laranja aparece junto às outras apps.</li>
            </ol>
          </div>
        ) : (
          <div className="pwa-install-steps">
            <p className="pwa-install-steps-title">No telemóvel Android (Chrome)</p>
            <ol>
              <li>Abre o menu do browser (⋮) no canto superior.</li>
              <li>Toca em <strong>Instalar aplicação</strong> ou <strong>Adicionar à página inicial</strong>.</li>
            </ol>
            {!deferred ? (
              <p className="pwa-install-note">Se não aparecer o botão acima, usa estas opções no menu do Chrome.</p>
            ) : null}
          </div>
        )}

        <button type="button" className="pwa-install-secondary" onClick={dismiss}>
          Agora não
        </button>
      </div>
    </div>
  )
}
