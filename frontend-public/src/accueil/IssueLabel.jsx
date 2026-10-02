import Visuel from './Visuel';
import { VISUELS } from './visuels';

// Issue d'un match, vue du SCR : image « Victoire », « Match nul » ou « Défaite »
export default function IssueLabel({ issue }) {
  const v = VISUELS.issue[issue];
  if (!v) return null;
  return <Visuel v={v} className="acc-issue" loading="lazy" />;
}
