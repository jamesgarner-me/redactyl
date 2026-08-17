export const PASTED_TEXT_FILENAME = 'pasted-text.txt';

export const CLIPBOARD_BLOCKED_HINT =
  'Clipboard access was blocked — press ⌘V (Mac) or Ctrl+V (Windows) to paste.';

/** Whether the Analyze CTA should be enabled for the current textarea value. */
export function hasAnalyzableText(text: string): boolean {
  return text.trim().length > 0;
}
