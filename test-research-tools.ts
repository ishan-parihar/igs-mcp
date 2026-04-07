/**
 * Integration test for new research download and PDF-to-markdown features.
 *
 * Tests:
 * 1. fs-helpers utilities
 * 2. PDF-to-markdown conversion
 * 3. Full research.download flow (download + convert + save)
 * 4. research.paper inline markdown extraction
 */

import { request } from 'undici';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { sanitizeFilename, resolvePaperPath, ensureDir } from './src/utils/fs-helpers.js';
import { convertPdfToMarkdown, extractMarkdownSummary } from './src/parsers/pdf-to-markdown.js';

const TEST_DIR = path.join(os.tmpdir(), 'igs-mcp-test-' + Date.now());
const TEST_PDF_URL = 'https://arxiv.org/pdf/1706.03762';
const TEST_PDF_ID = '1706.03762';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

async function downloadPdf(url: string): Promise<Buffer> {
  const res = await request(url, {
    headers: { 'user-agent': 'IGS-MCP-Test/1.0' },
  });
  assert(res.statusCode === 200, `Downloaded PDF: HTTP ${res.statusCode}`);
  return Buffer.from(await res.body.arrayBuffer());
}

async function testFsHelpers() {
  console.log('\n📁 Test Suite 1: fs-helpers');

  assert(sanitizeFilename('arxiv:2401.12345') === 'arxiv-2401.12345', 'Sanitize colons');
  assert(sanitizeFilename('paper/name?test*file') === 'paper-name-test-file', 'Sanitize multiple unsafe chars');
  assert(sanitizeFilename('clean-filename') === 'clean-filename', 'Pass through clean name');
  assert(sanitizeFilename('///triple-slashes///') === 'triple-slashes', 'Collapse slashes and trim');
  assert(sanitizeFilename('') === '', 'Empty string returns empty');

  const testSubDir = path.join(TEST_DIR, 'nested', 'deep', 'dir');
  await ensureDir(testSubDir);
  assert(existsSync(testSubDir), 'ensureDir creates nested directories');

  const defaultPath = await resolvePaperPath({
    paperId: TEST_PDF_ID,
    extension: 'pdf',
  });
  assert(defaultPath.endsWith(`${TEST_PDF_ID}.pdf`), `Default path ends with paper ID: ${defaultPath}`);
  assert(defaultPath.includes('igs-mcp/papers'), `Default path includes papers dir: ${defaultPath}`);

  const customPath = await resolvePaperPath({
    paperId: TEST_PDF_ID,
    outputPath: '/tmp/my-papers/test.pdf',
    extension: 'pdf',
  });
  assert(customPath === '/tmp/my-papers/test.pdf', 'Custom path resolved correctly');

  let threw = false;
  try {
    await resolvePaperPath({
      paperId: TEST_PDF_ID,
      outputPath: '/tmp/wrong-extension.md',
      extension: 'pdf',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Throws on wrong extension');
}

async function testPdfToMarkdown() {
  console.log('\n📄 Test Suite 2: PDF-to-Markdown Conversion');

  console.log('  Downloading test PDF (Attention Is All You Need)...');
  const pdfBuffer = await downloadPdf(TEST_PDF_URL);
  assert(pdfBuffer.length > 10000, `PDF downloaded: ${pdfBuffer.length} bytes`);

  const markdown = await convertPdfToMarkdown(pdfBuffer);
  assert(typeof markdown === 'string', 'convertPdfToMarkdown returns string');
  assert(markdown.length > 100, `Full markdown has content: ${markdown.length} chars`);

  const hasHeadings = /^#{1,6}\s/m.test(markdown);
  assert(hasHeadings, 'Markdown contains heading syntax');

  const hasContent = markdown.length > 500;
  assert(hasContent, 'Markdown has substantial content');

  const summary = await extractMarkdownSummary(pdfBuffer, 3000);
  assert(summary.startsWith('## Paper Summary'), 'Summary has header prefix');
  assert(summary.length <= 3500, `Summary within limit: ${summary.length} chars (max ~3500)`);

  assert(summary.length <= markdown.length, 'Summary is not longer than full markdown');

  const tinySummary = await extractMarkdownSummary(pdfBuffer, 500);
  assert(tinySummary.length <= 700, `Tiny summary constrained: ${tinySummary.length} chars`);
}

async function testResearchDownload() {
  console.log('\n⬇️  Test Suite 3: research.download Flow');

  const downloadDir = path.join(TEST_DIR, 'downloads');
  await ensureDir(downloadDir);

  const testPdfPath = path.join(downloadDir, `${TEST_PDF_ID}.pdf`);
  const testMdPath = path.join(downloadDir, `${TEST_PDF_ID}.md`);

  console.log('  Downloading PDF...');
  const pdfBuffer = await downloadPdf(TEST_PDF_URL);
  await writeFile(testPdfPath, pdfBuffer);

  const pdfStat = await stat(testPdfPath);
  assert(pdfStat.size > 10000, `PDF saved to disk: ${pdfStat.size} bytes`);
  assert(existsSync(testPdfPath), 'PDF file exists on disk');

  console.log('  Converting to markdown...');
  const markdown = await convertPdfToMarkdown(pdfBuffer);
  await writeFile(testMdPath, markdown, 'utf-8');

  const mdStat = await stat(testMdPath);
  assert(mdStat.size > 500, `Markdown saved to disk: ${mdStat.size} bytes`);
  assert(existsSync(testMdPath), 'Markdown file exists on disk');

  const mdContent = await readFile(testMdPath, 'utf-8');
  assert(mdContent.includes(markdown.slice(0, 50)), 'Saved markdown matches conversion output');

  const pdfOnlyPath = path.join(downloadDir, 'pdf-only.pdf');
  await writeFile(pdfOnlyPath, pdfBuffer);
  assert(existsSync(pdfOnlyPath), 'PDF-only mode saves PDF');

  const mdOnlyPath = path.join(downloadDir, 'md-only.md');
  const mdOnly = await convertPdfToMarkdown(pdfBuffer);
  await writeFile(mdOnlyPath, mdOnly, 'utf-8');
  assert(existsSync(mdOnlyPath), 'Markdown-only mode saves markdown');

  const result = {
    pdfPath: testPdfPath,
    markdownPath: testMdPath,
    fileSize: pdfBuffer.length,
    markdownSize: Buffer.byteLength(markdown, 'utf-8'),
    metadata: {
      id: TEST_PDF_ID,
      title: 'Attention Is All You Need',
      authors: ['Vaswani', 'Shazeer', 'Parmar', 'Uszkoreit', 'Jones'],
      pdfUrl: TEST_PDF_URL,
      year: 2017,
      citations: 150000,
    },
  };

  assert(typeof result.pdfPath === 'string', 'Result has pdfPath');
  assert(typeof result.markdownPath === 'string', 'Result has markdownPath');
  assert(typeof result.fileSize === 'number', 'Result has fileSize');
  assert(typeof result.markdownSize === 'number', 'Result has markdownSize');
  assert(typeof result.metadata.title === 'string', 'Result has metadata.title');
}

async function testResearchPaperInline() {
  console.log('\n📖 Test Suite 4: research.paper Inline Extraction');

  const pdfBuffer = await downloadPdf(TEST_PDF_URL);

  const inline = await extractMarkdownSummary(pdfBuffer, 3000);
  assert(inline.startsWith('## Paper Summary'), 'Inline summary has header');
  assert(inline.length <= 3500, `Inline within token limit: ${inline.length} chars`);

  const hasAttention = inline.toLowerCase().includes('attention') || inline.toLowerCase().includes('transformer');
  assert(hasAttention, 'Inline summary contains paper-relevant content');

  const tokenEstimate = Math.ceil(inline.length / 4);
  assert(tokenEstimate > 0 && tokenEstimate < 2000, `Token estimate reasonable: ~${tokenEstimate}`);
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test files...');
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
    console.log('  ✅ Test directory removed');
  } catch (err) {
    console.warn('  ⚠️  Cleanup failed:', err);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('IGS MCP Server - Research Tools Integration Test');
  console.log('='.repeat(60));
  console.log(`Test directory: ${TEST_DIR}`);

  try {
    await testFsHelpers();
    await testPdfToMarkdown();
    await testResearchDownload();
    await testResearchPaperInline();
  } catch (err) {
    console.error('\n💥 Test suite failed with error:', err);
    failed++;
  } finally {
    await cleanup();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
