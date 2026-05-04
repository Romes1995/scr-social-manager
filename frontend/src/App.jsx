import { useState } from 'react';
import TopNav from './components/TopNav';
import HomePage from './pages/HomePage';
import Programme from './pages/Programme';
import ScoreLive from './pages/ScoreLive';
import Resultats from './pages/Resultats';
import Templates from './pages/Templates';
import Listes from './pages/Listes';
import MatchDay from './pages/MatchDay';
import ConvocationPreparator from './pages/ConvocationPreparator';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const isHome = activeTab === 'home';

  const renderPage = () => {
    switch (activeTab) {
      case 'home':        return <HomePage activeTab={activeTab} setActiveTab={setActiveTab} />;
      case 'programme':   return <Programme />;
      case 'score_live':  return <ScoreLive />;
      case 'resultats':   return <Resultats />;
      case 'templates':   return <Templates />;
      case 'listes':      return <Listes />;
      case 'matchday':    return <MatchDay />;
      case 'convocation': return <ConvocationPreparator />;
      default:            return <HomePage activeTab={activeTab} setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className={`app${isHome ? ' app--dark' : ''}`}>
      {/* TopNav persistant pour toutes les pages sauf l'accueil (qui a son propre nav) */}
      {!isHome && <TopNav activeTab={activeTab} setActiveTab={setActiveTab} />}
      <main className={`main-content${isHome ? ' main-content--home' : ''}`}>
        {renderPage()}
      </main>
    </div>
  );
}
