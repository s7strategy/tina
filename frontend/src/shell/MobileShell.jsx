import { useEffect } from 'react'
import MobileBottomNav from '../components/mobile/MobileBottomNav.jsx'

export default function MobileShell({ currentTab, setCurrentTab, onOpenSettings, children }) {
  useEffect(() => {
    document.body.classList.add('dashboard-mobile-body')
    return () => document.body.classList.remove('dashboard-mobile-body')
  }, [])

  return (
    <div className="app app-shell-mobile">
      <div id="mobile-live-strip-host" className="mobile-live-strip-host" aria-hidden />
      <div className="mn mn-mobile">{children}</div>
      <MobileBottomNav currentTab={currentTab} setCurrentTab={setCurrentTab} onOpenSettings={onOpenSettings} />
    </div>
  )
}
