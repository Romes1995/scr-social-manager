export default function Header() {
  return (
    <header className="app-header">
      <div className="header-logo">
        <div className="logo-badge">SCR</div>
        <div className="logo-text">
          <span className="logo-title">SCR Social Manager</span>
          <span className="logo-subtitle">SC Roeschwoog — Outil de gestion réseaux sociaux</span>
        </div>
      </div>
      <div className="header-status">
        <span className="status-dot"></span>
        <span>Beta v1.0</span>
      </div>
    </header>
  );
}
