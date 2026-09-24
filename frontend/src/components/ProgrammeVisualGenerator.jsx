import { useState } from 'react';
import JSZip from 'jszip';
import { generateProgramme, publishFacebook, publishInstagram } from '../services/api';

export default function ProgrammeVisualGenerator({ matches, fallbackDate }) {
  const [selectedIds, setSelectedIds] = useState(matches.slice(0, 4).map(m => m.id));
  const [generating, setGenerating] = useState(false);
  const [visuels, setVisuels] = useState(null); // { story_url, post_url, tv_url?, weekendDate }
  const [publishingVisuel, setPublishingVisuel] = useState(null);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState(null);

  const toggleMatch = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const handleGenerate = async () => {
    const selected = matches.filter(m => selectedIds.includes(m.id));
    if (selected.length === 0) { setError('Sélectionnez au moins un match'); return; }
    setGenerating(true);
    setError(null);
    setVisuels(null);
    try {
      const payload = selected.map(m => ({
        equipe: m.equipe,
        adversaire: m.adversaire,
        logo_adversaire: m.logo_adversaire || null,
        date: m.date,
        heure: m.heure,
        domicile: m.domicile,
      }));
      const res = await generateProgramme(payload);
      const datedMatches = selected.filter(m => m.date).sort((a, b) => new Date(a.date) - new Date(b.date));
      const weekendDate = datedMatches.length > 0
        ? datedMatches[0].date.slice(0, 10)
        : (fallbackDate || new Date().toISOString().slice(0, 10));
      setVisuels({ ...res.data, weekendDate });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!visuels) return;
    setZipping(true);
    try {
      const entries = [
        { name: 'story_instagram.png', url: visuels.story_url },
        { name: 'post_facebook.png', url: visuels.post_url },
        ...(visuels.tv_url ? [{ name: 'ecran_tv.png', url: visuels.tv_url }] : []),
      ];
      const zip = new JSZip();
      await Promise.all(entries.map(async ({ name, url }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Impossible de récupérer ${name}`);
        zip.file(name, await res.blob());
      }));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `programme_${visuels.weekendDate}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(zipUrl);
    } catch {
      setError('Erreur lors de la création du ZIP');
    } finally {
      setZipping(false);
    }
  };

  const handlePublishVisuel = async (type) => {
    if (!visuels) return;
    setPublishingVisuel(type);
    try {
      const imageUrl = type === 'facebook' ? visuels.post_url : visuels.story_url;
      const fn = type === 'facebook' ? publishFacebook : publishInstagram;
      await fn({ image_url: imageUrl, message: 'Programme du week-end SCR Roeschwoog' });
    } catch {
      setError(`Erreur lors de la publication ${type}`);
    } finally {
      setPublishingVisuel(null);
    }
  };

  return (
    <div style={{
      marginTop: 16,
      padding: '14px 16px',
      background: '#f0f9f4',
      borderRadius: 10,
      border: '1px solid #c3e6cb',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a6b3c' }}>
          🖼️ Visuels du week-end
        </span>
        <button
          className={`btn btn-sm ${generating ? 'btn-ghost' : 'btn-primary'}`}
          onClick={handleGenerate}
          disabled={generating || selectedIds.length === 0}
          style={{ fontSize: 12 }}
        >
          {generating ? '⏳ Génération…' : `✨ Générer (${selectedIds.length} match${selectedIds.length > 1 ? 's' : ''})`}
        </button>
      </div>

      {matches.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {matches.map(m => (
            <label key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '8px 12px', borderRadius: 8, border: '1px solid',
              borderColor: selectedIds.includes(m.id) ? 'var(--scr-green, #1a6b3c)' : '#c3e6cb',
              background: selectedIds.includes(m.id) ? '#dcf3e4' : '#ffffff',
              opacity: !selectedIds.includes(m.id) && selectedIds.length >= 4 ? 0.5 : 1,
              fontSize: 13,
            }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(m.id)}
                onChange={() => toggleMatch(m.id)}
                disabled={!selectedIds.includes(m.id) && selectedIds.length >= 4}
              />
              <span style={{ fontWeight: 600, minWidth: 55 }}>{m.equipe}</span>
              <span>vs <strong>{m.adversaire}</strong></span>
              {m.heure && <span style={{ color: '#888', marginLeft: 'auto' }}>{m.heure.slice(0, 5)}</span>}
            </label>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', background: '#fee2e2', padding: '6px 10px', borderRadius: 6 }}>
          ❌ {error}
        </div>
      )}

      {visuels && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#444' }}>Aperçu des visuels générés</span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleDownloadZip}
              disabled={zipping}
            >
              {zipping ? '⏳ Préparation...' : `📦 Télécharger les ${visuels.tv_url ? 3 : 2} visuels (ZIP)`}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {/* Story */}
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: '#444' }}>Story Instagram (1080×1920)</p>
              <img
                src={visuels.story_url}
                alt="Story"
                style={{ width: 180, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handlePublishVisuel('instagram')}
                  disabled={publishingVisuel !== null}
                  style={{ fontSize: 12 }}
                >
                  {publishingVisuel === 'instagram' ? '⏳' : '📸'} Instagram
                </button>
                <a
                  href={visuels.story_url}
                  download
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  ⬇️ Télécharger
                </a>
              </div>
            </div>

            {/* Post */}
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: '#444' }}>Post Facebook (940×788)</p>
              <img
                src={visuels.post_url}
                alt="Post"
                style={{ width: 280, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handlePublishVisuel('facebook')}
                  disabled={publishingVisuel !== null}
                  style={{ fontSize: 12, background: '#1877f2', borderColor: '#1877f2' }}
                >
                  {publishingVisuel === 'facebook' ? '⏳' : '👍'} Facebook
                </button>
                <a
                  href={visuels.post_url}
                  download
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  ⬇️ Télécharger
                </a>
              </div>
            </div>

            {/* TV (optionnel — présent seulement si le fond programme_tv.png existe) */}
            {visuels.tv_url && (
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <p style={{ fontWeight: 600, marginBottom: 8, color: '#444' }}>Écran TV (1280×720)</p>
                <img
                  src={visuels.tv_url}
                  alt="TV"
                  style={{ width: 320, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block', marginBottom: 12 }}
                />
                <a
                  href={visuels.tv_url}
                  download
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  ⬇️ Télécharger
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
