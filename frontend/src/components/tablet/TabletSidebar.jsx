import { Settings } from 'lucide-react'
import { LOGO_SRC } from '../../lib/branding.js'
import { tabItems } from '../../shell/tabItems.js'

export default function TabletSidebar({ currentTab, setCurrentTab, onOpenSettings }) {
  return (
    <div className="sb">
      <div className="sb-logo sb-logo--mark" aria-hidden>
        <img src={LOGO_SRC} alt="" width={120} height={40} decoding="async" />
      </div>
      {tabItems.map((item) => {
        const isOn = currentTab === item.key
        const TabIcon = item.Icon
        return (
          <button key={item.key} type="button" className={`si${isOn ? ' on' : ''}`} onClick={() => setCurrentTab(item.key)} aria-label={item.label}>
            <span className="ic">
              <TabIcon size={22} strokeWidth={isOn ? 2.25 : 1.85} aria-hidden />
            </span>
            <span className="lb">{item.label}</span>
          </button>
        )
      })}
      <div className="sb-sp" />
      <button type="button" className="si" onClick={onOpenSettings} aria-label="Configurações">
        <span className="ic">
          <Settings size={22} strokeWidth={1.85} aria-hidden />
        </span>
        <span className="lb">Config</span>
      </button>
    </div>
  )
}
