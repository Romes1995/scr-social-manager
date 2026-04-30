import { useState, useRef } from 'react';
import { generateMatchText } from '../services/api';

export default function ProgrammeTextGenerator({ matchIds, weekendLabel }) {
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [copied, setCopied]     = useState(false);
  const textareaRef             = useRef(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setText('');
    try {
      const res = await generateMatchText(matchIds);
      setText(res.data.text || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
          📝 Texte de publication
        </span>
        <button
          className={`btn btn-sm ${loading ? 'btn-ghost' : 'btn-primary'}`}
          onClick={handleGenerate}
          disabled={loading || matchIds.length === 0}
          style={{ fontSize: 12 }}
        >
          {loading ? '⏳ Génération…' : '✨ Générer le texte'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', background: '#fee2e2', padding: '6px 10px', borderRadius: 6 }}>
          ❌ {error}
        </div>
      )}

      {text && (
        <div style={{ marginTop: 12 }}>
          <textarea
            ref={textareaRef}
            readOnly
            value={text}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: 200,
              fontFamily: "'Courier New', monospace",
              fontSize: 13,
              lineHeight: 1.7,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #c3e6cb',
              background: '#ffffff',
              resize: 'vertical',
              color: '#1a1a1a',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className={`btn btn-sm ${copied ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleCopy}
              style={{ fontSize: 12 }}
            >
              {copied ? '✅ Copié !' : '📋 Copier'}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleGenerate}
              disabled={loading}
              style={{ fontSize: 12 }}
            >
              🔄 Régénérer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
