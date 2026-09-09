export class ClipboardHelper {
  // Copies text to the clipboard, falling back to the older
  // select-and-execCommand approach when navigator.clipboard isn't
  // available (older browsers, non-secure origins, etc.) rather than
  // failing silently. Returns whether the copy actually succeeded.
  static async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('navigator.clipboard.writeText failed, falling back: ' + err);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (fallbackErr) {
        console.error('Clipboard fallback also failed: ' + fallbackErr);
        return false;
      }
    }
  }

  // ngb-tooltip only re-reads its content when it (re)opens - it won't
  // refresh already-visible content just because the bound string
  // changed. Forces a fresh open so feedback like "Copied!" shows
  // immediately, without the cursor having to leave and come back.
  // Deferred a tick so change detection has actually pushed the new
  // text into the tooltip directive's input before it reopens.
  static refreshTooltip(tooltip: any) {
    if (!tooltip) {
      return;
    }
    setTimeout(() => {
      tooltip.close();
      tooltip.open();
    });
  }
}
