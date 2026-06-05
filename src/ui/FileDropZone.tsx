import { useRef, useState } from 'react';

const ACCEPTED = ['.pdf', '.txt', '.md'];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

interface Props {
  onFile: (file: File) => void;
  onReject: (message: string) => void;
  error?: string;
}

export function FileDropZone({ onFile, onReject, error }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      onReject(`One file at a time in v1. You dropped ${files.length} files.`);
      return;
    }
    const file = files[0];
    if (!ACCEPTED.includes(extensionOf(file.name))) {
      onReject(`Redactyl handles .pdf, .txt and .md in this build. "${file.name}" isn't supported.`);
      return;
    }
    onFile(file);
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
      <p className="dropzone-headline">Drop a file here</p>
      <p className="dropzone-or">or</p>
      <button type="button" className="choose-file" onClick={() => inputRef.current?.click()}>
        Choose a file…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf"
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
      </p>
      {error && (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
