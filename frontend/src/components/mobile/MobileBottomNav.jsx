import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Lightbulb, Plus, Settings, X } from 'lucide-react'
import { tabItems } from '../../shell/tabItems.js'
import {
  applyPinAtSlot,
  hasSeenNavOnboarding,
  loadPinnedKeys,
  markNavOnboardingSeen,
  savePinnedKeys,
} from '../../lib/mobileNavPins.js'

const ICON_SLOT = 20
const ICON_SHEET = 28
const LONG_MS = 520

const sheetExtras = [{ key: 'settings', label: 'Config', Icon: Settings, isSettings: true }]

function itemByKey() {
  const m = {}
  for (const t of tabItems) m[t.key] = t
  return m
}

export default function MobileBottomNav({ currentTab, setCurrentTab, onOpenSettings }) {
  const byKey = itemByKey()
  const [pinnedKeys, setPinnedKeys] = useState(loadPinnedKeys)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [favTipOpen, setFavTipOpen] = useState(false)
  const [slotPickerTabKey, setSlotPickerTabKey] = useState(null)
  const [toast, setToast] = useState('')
  const [showOnboard, setShowOnboard] = useState(false)
  const longTimer = useRef(null)
  const longFired = useRef(false)

  useEffect(() => {
    setShowOnboard(!hasSeenNavOnboarding())
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!sheetOpen) return undefined
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (slotPickerTabKey) setSlotPickerTabKey(null)
      else setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, slotPickerTabKey])

  useEffect(() => {
    if (!sheetOpen) {
      setFavTipOpen(false)
      setSlotPickerTabKey(null)
    }
  }, [sheetOpen])

  const dismissOnboard = useCallback(() => {
    markNavOnboardingSeen()
    setShowOnboard(false)
  }, [])

  const clearLongTimer = useCallback(() => {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current)
      longTimer.current = null
    }
  }, [])

  const handleSheetPointerDown = useCallback(
    (item) => (e) => {
      if (item.isSettings) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      longFired.current = false
      clearLongTimer()
      longTimer.current = window.setTimeout(() => {
        longFired.current = true
        setSlotPickerTabKey(item.key)
        longTimer.current = null
      }, LONG_MS)
    },
    [clearLongTimer],
  )

  const commitPinSlot = useCallback(
    (slotIndex) => {
      if (!slotPickerTabKey) return
      const next = applyPinAtSlot(slotPickerTabKey, slotIndex, pinnedKeys)
      setPinnedKeys(next)
      savePinnedKeys(next)
      setSlotPickerTabKey(null)
      setToast('Atalho atualizado')
      setSheetOpen(false)
    },
    [pinnedKeys, slotPickerTabKey],
  )

  const handleSheetPointerEnd = useCallback(
    (item) => () => {
      clearLongTimer()
      if (longFired.current) {
        longFired.current = false
        return
      }
      if (item.isSettings) {
        onOpenSettings()
      } else {
        setCurrentTab(item.key)
      }
      setSheetOpen(false)
    },
    [clearLongTimer, onOpenSettings, setCurrentTab],
  )

  const handleSheetPointerCancel = useCallback(() => {
    clearLongTimer()
    longFired.current = false
  }, [clearLongTimer])

  const left = pinnedKeys.slice(0, 2)
  const right = pinnedKeys.slice(2, 4)
  const fabAway = !pinnedKeys.includes(currentTab)

  const sheet = sheetOpen
    ? createPortal(
        <div className="mobile-more-root" role="presentation">
          <button
            type="button"
            className="mobile-more-backdrop"
            aria-label={slotPickerTabKey ? 'Cancelar escolha do lugar' : 'Fechar menu'}
            onClick={() => {
              if (slotPickerTabKey) setSlotPickerTabKey(null)
              else setSheetOpen(false)
            }}
          />
          <div className="mobile-more-panel" role="dialog" aria-modal="true" aria-label="Todos os destinos">
            <div className="mobile-more-handle" aria-hidden />
            <div className="mobile-more-head">
              <span className="mobile-more-title">O que deseja abrir?</span>
              <button
                type="button"
                className="mobile-more-close"
                onClick={() => {
                  if (slotPickerTabKey) setSlotPickerTabKey(null)
                  else setSheetOpen(false)
                }}
                aria-label="Fechar"
              >
                <X size={22} strokeWidth={2} />
              </button>
            </div>
            <p className="mobile-more-hint">
              Toque para ir à aba. <strong>Segure</strong> uma opção e escolha em qual dos <strong>4 lugares</strong> do menu ela fica.
            </p>
            <div className="mobile-more-tip-wrap">
              <button
                type="button"
                className={`mobile-more-tip-trigger${favTipOpen ? ' is-open' : ''}`}
                onClick={() => setFavTipOpen((o) => !o)}
                aria-expanded={favTipOpen}
                aria-controls={favTipOpen ? 'mobile-more-tip-panel' : undefined}
                id="mobile-more-tip-btn"
              >
                <Lightbulb size={16} strokeWidth={2.25} className="mobile-more-tip-trigger-ic" aria-hidden />
                <span className="mobile-more-tip-trigger-txt">Dica</span>
                <ChevronDown size={18} strokeWidth={2.25} className="mobile-more-tip-chevron" aria-hidden />
              </button>
              {favTipOpen ? (
                <div
                  id="mobile-more-tip-panel"
                  role="region"
                  aria-labelledby="mobile-more-tip-btn"
                  className="mobile-more-tip-panel"
                >
                  <p>Escolha suas abas favoritas para ficar principal no menu.</p>
                  <p className="mobile-more-tip-panel-second">Para trocar, segure uma opção e selecione qual substituir.</p>
                </div>
              ) : null}
            </div>
            {slotPickerTabKey ? (
              <div className="mobile-more-slot-picker" role="region" aria-label="Escolher lugar no menu">
                <div className="mobile-more-slot-picker-head">
                  <span className="mobile-more-slot-picker-title">
                    Onde colocar <strong>{byKey[slotPickerTabKey]?.label ?? slotPickerTabKey}</strong>?
                  </span>
                  <button type="button" className="mobile-more-slot-picker-cancel" onClick={() => setSlotPickerTabKey(null)}>
                    Cancelar
                  </button>
                </div>
                <p className="mobile-more-slot-picker-hint">Toque no lugar (1 a 4) que quer ocupar na barra.</p>
                <div className="mobile-more-slot-picker-row">
                  {[
                    { slot: 0, label: 'Esq. 1' },
                    { slot: 1, label: 'Esq. 2' },
                    { slot: 2, label: 'Dir. 1' },
                    { slot: 3, label: 'Dir. 2' },
                  ].map(({ slot, label }) => {
                    const keyAt = pinnedKeys[slot]
                    const TabIcon = keyAt ? byKey[keyAt]?.Icon : null
                    return (
                      <button
                        key={slot}
                        type="button"
                        className="mobile-more-slot-btn"
                        onClick={() => commitPinSlot(slot)}
                        aria-label={`${label}: substituir por ${byKey[slotPickerTabKey]?.label ?? slotPickerTabKey}`}
                      >
                        <span className="mobile-more-slot-btn-pos">{label}</span>
                        {TabIcon ? (
                          <span className="mobile-more-slot-btn-ico">
                            <TabIcon size={22} strokeWidth={1.85} aria-hidden />
                          </span>
                        ) : null}
                        <span className="mobile-more-slot-btn-cur">{keyAt ? byKey[keyAt]?.label : '—'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <div className={`mobile-more-grid${slotPickerTabKey ? ' is-dimmed' : ''}`}>
              {[...tabItems, ...sheetExtras].map((item) => {
                const TabIcon = item.Icon
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`mobile-more-item${currentTab === item.key && !item.isSettings ? ' is-current' : ''}`}
                    onPointerDown={handleSheetPointerDown(item)}
                    onPointerUp={handleSheetPointerEnd(item)}
                    onPointerCancel={handleSheetPointerCancel}
                    onLostPointerCapture={handleSheetPointerCancel}
                  >
                    <span className="mobile-more-item-ico">
                      <TabIcon size={ICON_SHEET} strokeWidth={1.85} aria-hidden />
                    </span>
                    <span className="mobile-more-item-label">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      {toast ? (
        <div className="mobile-nav-toast" role="status">
          {toast}
        </div>
      ) : null}
      <div className="mobile-bottom-nav-cap">
        {showOnboard ? (
          <div className="mobile-nav-onboard" role="note">
            <button type="button" className="mobile-nav-onboard-dismiss" onClick={dismissOnboard} aria-label="Fechar dica">
              <X size={16} strokeWidth={2.5} />
            </button>
            <p>
              Toque no <strong>+</strong> para ver tudo. <strong>Segure</strong> uma aba e escolha qual dos <strong>4 lugares</strong> do menu ela ocupa.
            </p>
            <button type="button" className="mobile-nav-onboard-ok" onClick={dismissOnboard}>
              Entendi
            </button>
          </div>
        ) : null}
        <div className="mobile-nav-row" role="tablist">
          <div className="mobile-nav-side mobile-nav-side--left">
            {left.map((key) => {
              const item = byKey[key]
              if (!item) return null
              const TabIcon = item.Icon
              const isOn = currentTab === item.key
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  className={`mobile-nav-slot${isOn ? ' on' : ''}`}
                  onClick={() => setCurrentTab(item.key)}
                  aria-label={item.label}
                  aria-current={isOn ? 'page' : undefined}
                >
                  <TabIcon size={ICON_SLOT} strokeWidth={isOn ? 2.25 : 1.85} aria-hidden />
                  <span className="mobile-nav-slot-label">{item.label}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={`mobile-nav-fab${fabAway ? ' mobile-nav-fab--away' : ''}`}
            onClick={() => setSheetOpen(true)}
            aria-label="Abrir todos os destinos"
            aria-expanded={sheetOpen}
          >
            <Plus size={24} strokeWidth={2.25} aria-hidden />
          </button>
          <div className="mobile-nav-side mobile-nav-side--right">
            {right.map((key) => {
              const item = byKey[key]
              if (!item) return null
              const TabIcon = item.Icon
              const isOn = currentTab === item.key
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  className={`mobile-nav-slot${isOn ? ' on' : ''}`}
                  onClick={() => setCurrentTab(item.key)}
                  aria-label={item.label}
                  aria-current={isOn ? 'page' : undefined}
                >
                  <TabIcon size={ICON_SLOT} strokeWidth={isOn ? 2.25 : 1.85} aria-hidden />
                  <span className="mobile-nav-slot-label">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {sheet}
    </nav>
  )
}
