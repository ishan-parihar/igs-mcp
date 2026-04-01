/**
 * Google News RSS URL rewriter.
 * 
 * Injects date range (after:/before:) and keyword params into Google News search URLs.
 * 
 * GN search URL format:
 *   https://news.google.com/rss/search?q=<existing_query>&hl=...&gl=...&ceid=...
 * 
 * We inject into the q param:
 *   - after:YYYY-MM-DD (from start date)
 *   - before:YYYY-MM-DD (from end date)
 *   - keyword terms (appended to existing query)
 * 
 * Non-GN URLs pass through unchanged.
 */

export function rewriteGnUrl(
  sourceUrl: string,
  opts: { start?: string; end?: string; keywords?: string[] }
): string {
  // Only process Google News RSS search URLs
  if (!sourceUrl.includes('news.google.com/rss/search')) {
    return sourceUrl;
  }

  try {
    const url = new URL(sourceUrl);
    const q = url.searchParams.get('q') || '';
    
    let newQuery = q;
    const additions: string[] = [];

    // Inject date range
    if (opts.start) {
      const afterDate = formatDateForGN(opts.start);
      if (afterDate) {
        additions.push(`after:${afterDate}`);
      }
    }
    if (opts.end) {
      const beforeDate = formatDateForGN(opts.end);
      if (beforeDate) {
        additions.push(`before:${beforeDate}`);
      }
    }

    // Inject keywords
    if (opts.keywords && opts.keywords.length > 0) {
      additions.push(...opts.keywords);
    }

    // Append additions to query
    if (additions.length > 0) {
      newQuery = newQuery.trim();
      if (newQuery.length > 0) {
        newQuery += ' ' + additions.join(' ');
      } else {
        newQuery = additions.join(' ');
      }
    }

    url.searchParams.set('q', newQuery);
    return url.toString();
  } catch {
    // URL parsing failed, return original
    return sourceUrl;
  }
}

/**
 * Formats a date string for Google News search.
 * Accepts YYYY-MM-DD or ISO format, returns YYYY-MM-DD.
 */
function formatDateForGN(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}
