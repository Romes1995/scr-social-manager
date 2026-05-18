import { useState } from 'react';
import HeaderVitrine from '../components/HeaderVitrine';
import VitrineGrid   from '../components/VitrineGrid';

export default function Vitrine() {
  const [activeTeam, setActiveTeam] = useState(0);

  return (
    <div className="vitrine-page">
      <HeaderVitrine activeTeam={activeTeam} setActiveTeam={setActiveTeam} />
      <main className="vitrine-main">
        <VitrineGrid key={activeTeam} activeTeam={activeTeam} />
      </main>
    </div>
  );
}
