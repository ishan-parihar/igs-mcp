import { load as loadHtml } from 'cheerio';
import { stripHtml } from '../normalize/html.js';

const NOISE_SELECTORS = [
  'nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript',
  'iframe', 'form', '[role=navigation]', '[role=banner]', '[role=contentinfo]',
  '.ad', '.ads', '.advertisement', '.sidebar', '.related', '.recommended',
  '.newsletter', '.subscribe', '.paywall', '.cookie', '.popup', '.modal',
  '.social', '.share', '.comments', '.comment', '.author-box', '.bio',
  'figure', 'figcaption',
];

const CONTENT_SELECTORS = [
  'article',
  '[role=main]',
  '.article-body',
  '.article-content',
  '.story-body',
  '.post-content',
  '.entry-content',
  '.content-body',
  '.article__body',
  '.article__content',
  '.story__body',
  'main .content',
  '#article-body',
  '#story-body',
];

export function extractArticleContent(html: string): string {
  const $ = loadHtml(html);

  // Remove noise elements
  NOISE_SELECTORS.forEach(sel => $(sel).remove());

  // Try content-specific selectors first
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const paragraphs = el.find('p').toArray()
        .map(p => stripHtml($(p).text()).trim())
        .filter(t => t.length > 40);
      if (paragraphs.length >= 3) {
        return paragraphs.join('\n\n');
      }
    }
  }

  // Fallback: find the container with the most paragraph text
  const candidates = $('div, section, main').toArray();
  let bestText = '';
  let bestScore = 0;

  for (const el of candidates) {
    const paragraphs = $(el).find('p').toArray()
      .map(p => stripHtml($(p).text()).trim())
      .filter(t => t.length > 40);
    const totalLen = paragraphs.join(' ').length;
    const score = paragraphs.length * 2 + (totalLen > 500 ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestText = paragraphs.join('\n\n');
    }
  }

  if (bestText.length > 200) return bestText;

  // Last resort: all <p> tags on the page
  const allParas = $('p').toArray()
    .map(p => stripHtml($(p).text()).trim())
    .filter(t => t.length > 40);

  return allParas.slice(0, 20).join('\n\n');
}
