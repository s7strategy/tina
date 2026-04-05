export default function LoadingSpinner({ message = 'Carregando...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--bd)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: '0.85em', color: 'var(--t3)', fontWeight: 600 }}>{message}</span>
    </div>
  )
}
