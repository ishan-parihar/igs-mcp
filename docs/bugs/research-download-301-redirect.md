# Bug: `research.download` & `research.paper` fail on HTTP 301 — undici doesn't follow redirects

## Severity
**P0 — Core tool broken.** The entire `research.download` tool is non-functional for arXiv papers. `research.paper` with `extractPDF=true` also broken.

---

## Symptoms

```
Failed to download PDF: HTTP 301
```

Occurs on ALL arXiv paper downloads. Semantic Scholar papers may also be affected if their `openAccessPdf.url` returns a redirect.

---

## Root Cause

`undici.request()` does **not** follow HTTP redirects by default. It returns `3xx` responses as-is, and the download code throws on any non-200 status.

### Affected locations

| File | Line(s) | Tool | Issue |
|------|---------|------|-------|
| `src/tools/research.ts` | 323-328 | `research.download` | `request(pdfUrl, ...)` → checks `statusCode !== 200` → throws `HTTP 301` |
| `src/tools/research.ts` | 247-253 | `research.paper` (extractPDF) | Same pattern, silently fails on redirect |

### How it manifests

1. `searchArxiv()` returns `pdfUrl: "https://arxiv.org/pdf/2004.12011v1.pdf"` (constructed in `arxiv-api.ts:133`)
2. arXiv's `/pdf/` endpoint responds with `HTTP 301 Moved Permanently` → actual PDF served at a different URL
3. `undici.request()` returns the 301 response (no redirect following)
4. Code throws: `Failed to download PDF: HTTP 301`

### Verified manually

```bash
# arXiv returns 301 for all PDF requests
curl -sI https://arxiv.org/pdf/2004.12011v1.pdf | head -5
HTTP/2 301
location: https://arxiv.org/pdf/2004.12011v1

# Note: it strips the .pdf extension and redirects
```

---

## Fix

### Option A: Add `maxRedirections` to undici (recommended, simplest)

```typescript
// src/tools/research.ts — line 323
const res = await request(pdfUrl, {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)' },
  maxRedirections: 5,  // ← ADD THIS
});
```

Apply the same fix to:
- `src/tools/research.ts:247` (`research.paper` extractPDF block)

**Why this works:** `undici` supports `maxRedirections` option which enables automatic redirect following. Setting it to `5` handles the common 1-2 hop redirects from arXiv and Semantic Scholar CDN URLs.

### Option B: Handle 3xx responses manually (fallback if Option A fails)

If for some reason `maxRedirections` doesn't work in your undici version:

```typescript
// Helper to follow redirects manually
async function fetchWithRedirects(url: string, maxRedirects = 5): Promise<Response> {
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await request(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)' },
    });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      url = Array.isArray(res.headers.location) 
        ? res.headers.location[0] 
        : res.headers.location;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects for ${url}`);
}
```

### Option C: Fix PDF URL construction at the source

In `src/utils/arxiv-api.ts:133`, the URL is constructed as:
```typescript
pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
```

arXiv's actual PDF URLs work without the `.pdf` extension. However, this alone won't solve it because arXiv still issues a 301 redirect from `/pdf/<id>` to the CDN. So **Option C is insufficient on its own** — you still need redirect following.

---

## Additional issues discovered during investigation

### 1. Silent failure in `research.paper` (extractPDF)

`src/tools/research.ts:243-263` catches the error and silently sets `content = 'PDF extraction failed'`:
```typescript
} catch (err) {
  console.error('PDF extraction failed:', err);
  result.paper.content = 'PDF extraction failed';
}
```

This masks the bug — users see "PDF extraction failed" but don't know it's a redirect issue.

**Recommendation:** Include the actual error status code in the message:
```typescript
result.paper.content = `PDF extraction failed: ${err.message}`;
```

### 2. No timeout handling in download

`research.download` at line 323 has no `headersTimeout`/`bodyTimeout`. Large PDF downloads can hang indefinitely.

**Recommendation:**
```typescript
const res = await request(pdfUrl, {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)' },
  maxRedirections: 5,
  headersTimeout: 15000,
  bodyTimeout: 60000,  // PDFs can be large
});
```

### 3. No retry logic for transient failures

Unlike `searchSemanticScholar` which has 3-attempt retry logic, the download code has zero retry. Network hiccups during PDF download are common.

---

## Testing the fix

After applying Option A, verify with:

```typescript
// In test-research-tools.ts or manual test
const result = await client.callTool({
  tool: 'research.download',
  arguments: {
    paperId: 'arxiv:2004.12011v1',
    format: 'pdf',
  },
});
// Should return pdfPath, not throw HTTP 301
```

Test with multiple papers to ensure redirects work across different arXiv ID formats:
- `arxiv:2004.12011v1` (versioned ID)
- `arxiv:2401.12345` (no version)
- `arxiv:math/0409076` (legacy format)

---

## Files to modify

1. `src/tools/research.ts` — Add `maxRedirections: 5` + timeout to both `request()` calls (lines 247, 323)
2. Optional: `src/tools/research.ts` — Improve error message in extractPDF catch block (line 260)
