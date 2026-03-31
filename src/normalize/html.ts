// Utilities adapted from n8n code nodes for robust HTML stripping and entity decoding.

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'",
  '&lt;': '<', '&gt;': '>', '&rsquo;': "'", '&lsquo;': "'",
  '&sbquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&bdquo;': '"',
  '&mdash;': '-', '&ndash;': '-', '&hellip;': '...', '&#8217;': "'",
  '&#8220;': '"', '&#8221;': '"', '&#8212;': '-', '&#8211;': '-',
  '&#39;': "'", '&#34;': '"', '&copy;': '(c)', '&reg;': '(R)',
  '&#039;': "'", '&shy;': ''
};

export function decodeEntities(text: string): string {
  let t = text;
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, code) => {
    try { return String.fromCharCode(parseInt(code, 10)); } catch { return ''; }
  });
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
  });
  return t;
}

export function stripHtml(html: string): string {
  if (!html) return '';
  let text = String(html);
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
