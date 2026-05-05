import { useState, useRef, useCallback, useEffect } from 'react';
import HeaderVitrine   from '../components/HeaderVitrine';
import CarouselVitrine from '../components/CarouselVitrine';

const INTERVAL = 8000;
const N_TEAMS  = 3;

export default function Vitrine() {
  const [activeTeam, setActiveTeam] = useState(0);
  const timerRef  = useRef(null);

  // Démarre (ou redémarre) le timer auto-advance
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveTeam(prev => (prev + 1) % N_TEAMS);
    }, INTERVAL);
  }, []);

  // Arrête le timer
  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
  }, []);

  // Sélection manuelle : change l'équipe ET repart à 0 sur le timer
  const selectTeam = useCallback((idx) => {
    setActiveTeam(idx);
    startTimer();
  }, [startTimer]);

  // Démarrage au montage
  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [startTimer]);

  return (
    <div className="vitrine-page">
      <HeaderVitrine activeTeam={activeTeam} setActiveTeam={selectTeam} />
      <main className="vitrine-main">
        <CarouselVitrine
          activeTeam={activeTeam}
          setActiveTeam={selectTeam}
          onPause={stopTimer}
          onResume={startTimer}
        />
      </main>
    </div>
  );
}
