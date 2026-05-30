// Purpose + privacy on the model-ready dropzone. The pre-ready ModelGate
// landing (its model-lede + promise) is unmounted once the model loads, so this
// echoes it inside the dropzone panel rather than leaving a context-free screen.
// Reuses the landing's styles for visual continuity. Kept as its own component
// so the glossary guard (purpose before promise, no user-facing "strip") is
// unit-testable without booting App's model worker.
export function DropzoneIntro() {
  return (
    <div className="dropzone-intro">
      <p className="model-lede">
        <strong>Redactyl removes personal data from your documents.</strong>
      </p>
      <p className="model-promise model-promise-callout">
        <strong>Nothing leaves your device.</strong> Detection runs entirely in your browser.
      </p>
    </div>
  );
}
