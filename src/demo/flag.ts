// Demo mode is opt-in via the `?demo` query param (e.g. http://localhost:5173/?demo).
// It surfaces a "Load sample document" affordance so the review → redact →
// receipt flow can be exercised without a real file — used for the slice-5
// design sign-off. No effect on the normal app path.
export function isDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}
