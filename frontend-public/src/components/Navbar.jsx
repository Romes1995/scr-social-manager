import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="logo-circle">SC</span>
        <span className="logo-name">SC Roeschwoog</span>
      </div>
      <div className="navbar-links">
        <NavLink to="/"         end  className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Live</NavLink>
        <NavLink to="/matchs"        className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Matchs</NavLink>
        <NavLink to="/buteurs"       className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Buteurs</NavLink>
        <NavLink to="/classement"    className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Classement</NavLink>
      </div>
    </nav>
  );
}
