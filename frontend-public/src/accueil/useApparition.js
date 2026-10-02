import { useEffect, useRef, useState } from 'react';

/**
 * Passe à true la première fois que l'élément entre dans l'écran (une seule fois).
 * Sans IntersectionObserver, l'élément est considéré comme visible d'emblée.
 */
export default function useApparition({ seuil = 0.25 } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const obs = new IntersectionObserver((entrees) => {
      if (entrees.some(e => e.isIntersecting)) {
        setVisible(true);
        obs.disconnect();
      }
    }, { threshold: seuil });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible, seuil]);

  return [ref, visible];
}
