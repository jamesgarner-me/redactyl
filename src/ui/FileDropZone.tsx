import { useRef, useState } from 'react';

interface Props {
  // The dropzone is intentionally dumb about support and counts: it forwards
  // every dropped/selected file and App's intake decides what to keep, what to
  // skip (warning modal), and what to reject (all-unsupported error). See ADR
  // 0005 / slice 05.
  onFiles: (files: File[]) => void;
  error?: string;
}

export function FileDropZone({ onFiles, error }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFiles(Array.from(files));
  }

  return (
    <div
      className={`dropzone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <p className="dropzone-headline">Drop files here</p>
      <p className="dropzone-or">or</p>
      <button type="button" className="choose-file" onClick={() => inputRef.current?.click()}>
        Choose files…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,.csv"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="dropzone-types">
        <span className="chip">.pdf</span>
        <span className="chip">.txt</span>
        <span className="chip">.md</span>
        <span className="chip">.csv</span>
      </p>
      {error && (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
