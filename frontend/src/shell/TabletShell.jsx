import TabletSidebar from '../components/tablet/TabletSidebar.jsx'

export default function TabletShell({ currentTab, setCurrentTab, onOpenSettings, children }) {
  return (
    <div className="app app-shell-tablet">
      <TabletSidebar currentTab={currentTab} setCurrentTab={setCurrentTab} onOpenSettings={onOpenSettings} />
      <div className="mn">{children}</div>
    </div>
  )
}
