import { LOGO_SRC } from '../../lib/branding.js'

/**
 * Tela de carregamento em tela cheia — alinhada ao tema (creme, laranja Tina, tipografia Plus Jakarta).
 */
export default function AppLoadingScreen({ title = 'Organizando sua vida', subtitle = 'Só um instante…' }) {
  return (
    <div className="app-loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="app-loading-screen__glow" aria-hidden />
      <div className="app-loading-screen__inner">
        <div className="app-loading-screen__logo-wrap">
          <img src={LOGO_SRC} alt="" className="app-loading-screen__logo" width={220} height={56} decoding="async" />
        </div>
        <div className="app-loading-screen__spinner" aria-hidden>
          <span className="app-loading-screen__orbit" />
          <span className="app-loading-screen__orbit app-loading-screen__orbit--delay" />
        </div>
        <h1 className="app-loading-screen__title">{title}</h1>
        <p className="app-loading-screen__subtitle">{subtitle}</p>
      </div>
    </div>
  )
}
