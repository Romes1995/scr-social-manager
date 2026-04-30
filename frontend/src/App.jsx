import { useState } from 'react';
import Header from './components/Header';
import Programme from './pages/Programme';
import ScoreLive from './pages/ScoreLive';
import Resultats from './pages/Resultats';
import Templates from './pages/Templates';
import Listes from './pages/Listes';
import MatchDay from './pages/MatchDay';
import ConvocationPreparator from './pages/ConvocationPreparator';
import './App.css';

const TABS = [
  { id: 'programme', label: 'Programme', icon: '📅' },
  { id: 'score_live', label: 'Score Live', icon: '⚡' },
  { id: 'resultats', label: 'Résultats', icon: '🏆' },
  { id: 'templates', label: 'Templates', icon: '🎨' },
  { id: 'listes',   label: 'Listes',   icon: '📋' },
  { id: 'matchday',    label: 'Match Day',  icon: '🏟️' },
  { id: 'convocation', label: 'Convocation', icon: '📨' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('programme');

  const renderPage = () => {
    switch (activeTab) {
      case 'programme': return <Programme />;
      case 'score_live': return <ScoreLive />;
      case 'resultats': return <Resultats />;
      case 'templates': return <Templates />;
      case 'listes':   return <Listes />;
      case 'matchday':    return <MatchDay />;
      case 'convocation': return <ConvocationPreparator />;
      default: return <Programme />;
    }
  };

  return (
    <div className="app">
      <Header />
      <nav className="tab-nav">
        <div className="tab-nav-inner">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
