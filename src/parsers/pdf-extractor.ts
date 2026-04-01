/**
 * Token-efficient PDF text extractor for research papers.
 * 
 * Strategy:
 * 1. Extract only key sections (abstract, intro, conclusion, results)
 * 2. Skip references, acknowledgments, appendices
 * 3. Limit total tokens (~2000 chars ≈ 500 tokens)
 * 4. Preserve citations as [Author et al., Year] format
 * 
 * Uses pdf-parse library for PDF text extraction.
 */

import pdf from 'pdf-parse';

export interface ExtractedPaperContent {
  title: string;
  authors: string[];
  abstract: string;
  sections: PaperSection[];
  citations: Citation[];
  references: string[];
  fullText: string;  // Concatenated, token-limited
  tokenEstimate: number;
}

export interface PaperSection {
  heading: string;
  content: string;
  order: number;
}

export interface Citation {
  text: string;
  authors?: string[];
  year?: string;
  position: number;
}

// Sections to prioritize (in order of importance)
const PRIORITY_SECTIONS = [
  'abstract',
  'introduction',
  'conclusion',
  'results',
  'discussion',
  'methodology',
  'methods',
  'experiments',
  'evaluation',
];

// Sections to skip
const SKIP_SECTIONS = [
  'acknowledgment',
  'acknowledgement',
  'references',
  'bibliography',
  'appendix',
  'supplementary',
  'author contribution',
  'conflict of interest',
  'funding',
];

// Max characters per section (token efficiency)
const MAX_ABSTRACT_CHARS = 400;
const MAX_SECTION_CHARS = 500;
const MAX_TOTAL_CHARS = 2500;  // ~625 tokens

/**
 * Extracts token-efficient content from a PDF buffer.
 */
export async function extractPaperFromPDF(pdfBuffer: Buffer): Promise<ExtractedPaperContent> {
  try {
    const pdfData = await pdf(pdfBuffer);
    const text = pdfData.text;
    
    // Parse into sections
    const sections = parseSections(text);
    
    // Extract title (first non-empty line, usually)
    const title = extractTitle(text, sections);
    
    // Extract authors (look for patterns like "Author1, Author2" near title)
    const authors = extractAuthors(text, title);
    
    // Extract abstract
    const abstract = extractAbstract(sections);
    
    // Get priority sections
    const prioritySections = sections
      .filter(s => !SKIP_SECTIONS.some(skip => s.heading.toLowerCase().includes(skip)))
      .sort((a, b) => {
        const aIndex = PRIORITY_SECTIONS.findIndex(p => a.heading.toLowerCase().includes(p));
        const bIndex = PRIORITY_SECTIONS.findIndex(p => b.heading.toLowerCase().includes(p));
        if (aIndex === -1 && bIndex === -1) return a.order - b.order;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .slice(0, 5);  // Top 5 sections
    
    // Extract citations
    const citations = extractCitations(text);
    
    // Build token-efficient full text
    const fullText = buildTokenEfficientText(abstract, prioritySections);
    
    // Extract references (just count, don't include full text)
    const references = extractReferences(text);
    
    return {
      title,
      authors,
      abstract,
      sections: prioritySections,
      citations,
      references,
      fullText,
      tokenEstimate: Math.ceil(fullText.length / 4),  // Rough estimate
    };
  } catch (err) {
    console.error('PDF extraction failed:', err);
    throw err;
  }
}

/**
 * Parses PDF text into sections based on headings.
 */
function parseSections(text: string): PaperSection[] {
  const sections: PaperSection[] = [];
  
  // Common heading patterns
  const headingRegex = /^(?:\d+\.?\s*)?([A-Z][A-Za-z\s,]{2,50})$/gm;
  
  let lastEnd = 0;
  let match;
  let order = 0;
  
  while ((match = headingRegex.exec(text)) !== null) {
    const heading = match[1].trim();
    const start = match.index;
    
    if (start > lastEnd) {
      const content = text.slice(lastEnd, start).trim();
      if (content.length > 50) {  // Only add if substantial
        sections.push({
          heading: 'Introduction',  // Default for first section
          content: content,
          order: order++,
        });
      }
    }
    
    lastEnd = start + match[0].length;
  }
  
  // Add remaining text as final section
  if (lastEnd < text.length) {
    const content = text.slice(lastEnd).trim();
    if (content.length > 50) {
      sections.push({
        heading: 'Conclusion',
        content: content,
        order: order++,
      });
    }
  }
  
  return sections;
}

/**
 * Extracts title from text.
 */
function extractTitle(text: string, sections: PaperSection[]): string {
  // Try first line
  const firstLine = text.split('\n')[0]?.trim();
  if (firstLine && firstLine.length > 10 && firstLine.length < 200) {
    return firstLine;
  }
  
  // Try first section heading
  if (sections.length > 0) {
    return sections[0].heading;
  }
  
  return 'Untitled Paper';
}

/**
 * Extracts author names from text.
 */
function extractAuthors(text: string, title: string): string[] {
  const authors: string[] = [];
  
  // Look for lines near title with author-like patterns
  const titleIndex = text.indexOf(title);
  if (titleIndex === -1) return authors;
  
  const context = text.slice(titleIndex, titleIndex + 500);
  const lines = context.split('\n').slice(1, 6);  // Lines after title
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines with keywords
    if (trimmed.toLowerCase().match(/abstract|introduction|department|university|email/)) {
      continue;
    }
    
    // Look for author patterns (Name, Name, Name)
    const authorMatches = trimmed.match(/([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g);
    if (authorMatches && authorMatches.length > 0) {
      authors.push(...authorMatches.slice(0, 5));
    }
  }
  
  return authors.length > 0 ? [...new Set(authors)] : [];
}

/**
 * Extracts abstract from sections.
 */
function extractAbstract(sections: PaperSection[]): string {
  const abstractSection = sections.find(s => 
    s.heading.toLowerCase().includes('abstract')
  );
  
  if (abstractSection) {
    return abstractSection.content.length > MAX_ABSTRACT_CHARS
      ? abstractSection.content.slice(0, MAX_ABSTRACT_CHARS) + '...'
      : abstractSection.content;
  }
  
  // Fallback: first paragraph
  for (const section of sections) {
    if (section.content.length > 100 && section.content.length < 500) {
      return section.content;
    }
  }
  
  return '';
}

/**
 * Extracts citation references from text.
 */
function extractCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  
  // Match patterns like "(Smith et al., 2023)" or "[12]" or "(Smith & Jones, 2022)"
  const citationRegex = /\(?([A-Z][a-z]+(?:\s+(?:et al\.?|&\s+[A-Z][a-z]+))?)?,?\s*(\d{4})\)?|\[(\d+)\]/g;
  
  let match;
  while ((match = citationRegex.exec(text)) !== null) {
    const citation: Citation = {
      text: match[0],
      position: match.index,
    };
    
    if (match[1]) {
      const authors = match[1].split(/&|et al\.?/).map(s => s.trim()).filter(Boolean);
      citation.authors = authors;
    }
    if (match[2]) {
      citation.year = match[2];
    }
    if (match[3]) {
      citation.text = `[${match[3]}]`;
    }
    
    citations.push(citation);
  }
  
  return citations.slice(0, 50);  // Limit citations
}

/**
 * Extracts reference list (just titles, not full citations).
 */
function extractReferences(text: string): string[] {
  const references: string[] = [];
  
  // Find references section
  const refIndex = text.search(/references\b/i);
  if (refIndex === -1) return references;
  
  const refSection = text.slice(refIndex);
  const lines = refSection.split('\n').filter(l => l.trim().length > 20);
  
  // Extract first 20 reference titles
  for (const line of lines.slice(0, 30)) {
    // Try to extract title (usually first part before journal name)
    const title = line.trim().split('.')[0];
    if (title.length > 10 && title.length < 150) {
      references.push(title);
    }
    
    if (references.length >= 20) break;
  }
  
  return references;
}

/**
 * Builds token-efficient full text from sections.
 */
function buildTokenEfficientText(abstract: string, sections: PaperSection[]): string {
  const parts: string[] = [];
  
  // Add abstract
  if (abstract) {
    parts.push(`Abstract: ${abstract}`);
  }
  
  // Add sections
  let totalChars = parts[0]?.length || 0;
  
  for (const section of sections) {
    const sectionText = `${section.heading}: ${section.content}`;
    const truncated = sectionText.length > MAX_SECTION_CHARS
      ? sectionText.slice(0, MAX_SECTION_CHARS)
      : sectionText;
    
    if (totalChars + truncated.length <= MAX_TOTAL_CHARS) {
      parts.push(truncated);
      totalChars += truncated.length + 2;  // +2 for newlines
    }
  }
  
  return parts.join('\n\n');
}

/**
 * Creates a token-efficient summary for LLM context.
 */
export function createPaperSummary(paper: ExtractedPaperContent): string {
  const lines: string[] = [];
  
  lines.push(`Title: ${paper.title}`);
  
  if (paper.authors.length > 0) {
    lines.push(`Authors: ${paper.authors.slice(0, 5).join(', ')}${paper.authors.length > 5 ? ' et al.' : ''}`);
  }
  
  if (paper.abstract) {
    lines.push(`Abstract: ${paper.abstract}`);
  }
  
  if (paper.sections.length > 0) {
    lines.push('\nKey Sections:');
    for (const section of paper.sections.slice(0, 3)) {
      lines.push(`- ${section.heading}: ${section.content.slice(0, 150)}...`);
    }
  }
  
  if (paper.citations.length > 0) {
    const uniqueCited = new Set(paper.citations.map(c => c.text));
    lines.push(`\nCitations: ${uniqueCited.size} references`);
  }
  
  lines.push(`\nToken estimate: ~${paper.tokenEstimate}`);
  
  return lines.join('\n');
}
