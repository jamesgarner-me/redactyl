import { useRef, useState } from 'react';
import { CLIPBOARD_BLOCKED_HINT, hasAnalyzableText } from './pasteConstants';

interface Props {
  onAnalyze: (text: string) => void;
  onCancel: () => void;
}

export function PasteScreen({ onAnalyze, onCancel }: Props) {
  const [text, setText] = useState('');
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function pasteFromClipboard() {
    setClipboardHint(null);
    try {
      const clip = await navigator.clipboard.readText();
      setText((prev) => (prev.length === 0 ? clip : `${prev}${clip}`));
    } catch {
      textareaRef.current?.focus();
      setClipboardHint(CLIPBOARD_BLOCKED_HINT);
    }
  }

  function clearText() {
    setText('');
    setClipboardHint(null);
    textareaRef.current?.focus();
  }

  return (
    <div className="paste-screen">
      <h2 className="paste-screen-title">Paste text</h2>
      <p className="paste-screen-lede">
        Paste or type the text you want to sanitise — no file needed.
      </p>

      <textarea
        ref={textareaRef}
        className="paste-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (clipboardHint) setClipboardHint(null);
        }}
        placeholder="Paste or type text here…"
        aria-label="Text to analyse"
      />

      {clipboardHint && (
        <p className="paste-clipboard-hint" role="status">
          {clipboardHint}
        </p>
      )}

      <div className="paste-toolbar">
        <button type="button" className="paste-secondary" onClick={pasteFromClipboard}>
          Paste from clipboard
        </button>
        <button type="button" className="paste-secondary" onClick={clearText}>
          Clear
        </button>
      </div>

      <button
        type="button"
        className="paste-analyze"
        disabled={!hasAnalyzableText(text)}
        onClick={() => onAnalyze(text)}
      >
        Analyze text
      </button>

      <button type="button" className="link-button paste-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
