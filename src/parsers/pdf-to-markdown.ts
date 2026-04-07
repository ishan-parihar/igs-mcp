/**
 * PDF-to-Markdown conversion module for the IGS MCP server.
 * 
 * Uses @opendocsg/pdf2md for high-fidelity PDF → Markdown conversion.
 * 
 * Two exported functions:
 * - convertPdfToMarkdown: Full conversion (for research.download tool)
 * - extractMarkdownSummary: Token-efficient summary (for research.paper inline response)
 */

import pdf2mdModule from '@opendocsg/pdf2md';

const pdf2md = pdf2mdModule.default ?? pdf2mdModule;

/**
 * Converts a PDF buffer to a full Markdown string.
 *
 * Designed for the `research.download` tool's full file conversion.
 *
 * @param buffer - PDF binary data as a Node.js Buffer
 * @returns Promise resolving to the full Markdown content
 * @throws Error with descriptive message on conversion failure
 */
export async function convertPdfToMarkdown(buffer: Buffer): Promise<string> {
  try {
    const markdown = await pdf2md(buffer);
    return markdown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF to markdown conversion failed: ${message}`);
  }
}

/**
 * Converts a PDF buffer to a token-efficient Markdown summary.
 *
 * Designed for the `research.paper` tool's inline response.
 * Truncates at the nearest heading boundary before `maxChars` to avoid
 * cutting mid-sentence. If no heading boundary is found, hard-truncates
 * and appends a truncation notice.
 *
 * @param buffer - PDF binary data as a Node.js Buffer
 * @param maxChars - Maximum character count for the summary (default: 3000)
 * @returns Promise resolving to the truncated Markdown with a header
 * @throws Error with descriptive message on conversion failure
 */
export async function extractMarkdownSummary(
  buffer: Buffer,
  maxChars = 3000,
): Promise<string> {
  try {
    const fullMarkdown = await convertPdfToMarkdown(buffer);

    if (fullMarkdown.length <= maxChars) {
      return `## Paper Summary\n${fullMarkdown}`;
    }

    // Truncate at the nearest heading boundary before maxChars
    const truncated = fullMarkdown.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');

    if (lastNewline !== -1) {
      // Check for heading boundaries (lines starting with # or ##)
      const beforeLastNewline = truncated.slice(0, lastNewline);
      const lastLineStart = beforeLastNewline.lastIndexOf('\n') + 1;
      const lastLine = beforeLastNewline.slice(lastLineStart);

      if (/^#{1,6}\s/.test(lastLine)) {
        return `## Paper Summary\n${beforeLastNewline}`;
      }
    }

    // No heading boundary found — hard truncate with notice
    return `## Paper Summary\n${truncated}...\n\n*--- truncated for brevancy ---*`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF to markdown conversion failed: ${message}`);
  }
}
