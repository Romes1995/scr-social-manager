import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <div className="logo-mark">SCR</div>
        <span className="logo-text">
          SCR <em>Social</em> Manager
        </span>
      </div>

      <div className="navbar-links">
        <NavLink to="/"           end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Accueil</NavLink>
        <NavLink to="/live"           className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Live</NavLink>
        <NavLink to="/matchs"         className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Matchs</NavLink>
        <NavLink to="/buteurs"        className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Buteurs</NavLink>
        <NavLink to="/classement"     className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Classement</NavLink>
      </div>

      <button className="btn-publier" onClick={() => window.open('http://localhost:5173', '_blank')}>
        Publier
      </button>
    </nav>
  );
}
