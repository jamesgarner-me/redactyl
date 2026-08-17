/** Whether the receipt should offer "Copy redacted text" for this output. */
export function isCopyableOutput(blob: Blob): boolean {
  return blob.type.startsWith('text/');
}
