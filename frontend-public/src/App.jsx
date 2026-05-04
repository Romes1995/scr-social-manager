import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './theme.css';
import Navbar      from './components/Navbar';
import ScoreLive   from './pages/ScoreLive';
import Matchs      from './pages/Matchs';
import Buteurs     from './pages/Buteurs';
import Classement  from './pages/Classement';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"            element={<ScoreLive />} />
        <Route path="/matchs"      element={<Matchs />} />
        <Route path="/buteurs"     element={<Buteurs />} />
        <Route path="/classement"  element={<Classement />} />
      </Routes>
    </BrowserRouter>
  );
}
