export default function Modal({ isOpen, id, onClose, title, children }) {
  return (
    <div className={`modal-bg${isOpen ? ' on' : ''}`} id={id} onClick={(event) => event.target === event.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}
