import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t2)' }}>
          <div style={{ fontSize: '2em', marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Algo deu errado</div>
          <div style={{ fontSize: '0.85em', color: 'var(--t3)', marginBottom: 12 }}>
            {this.state.error?.message || 'Erro inesperado na interface.'}
          </div>
          <button className="ib" onClick={() => this.setState({ hasError: false, error: null })}>
            Tentar novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
