import { useEffect, useState } from 'react';
import { LARGE } from './visuels';

// true à partir de 1024 px de large (version ordinateur), suivi en direct
export default function useEcranLarge() {
  const [large, setLarge] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(LARGE).matches);

  useEffect(() => {
    const mq = matchMedia(LARGE);
    const suivre = (e) => setLarge(e.matches);
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, []);

  return large;
}
