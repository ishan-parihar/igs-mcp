/**
 * Filesystem utilities for paper download feature.
 * 
 * Provides path resolution, directory creation, and filename sanitization
 * for saving research papers to local storage.
 */

import { mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Input type for resolving a paper's save path.
 */
export interface ResolvePaperPathInput {
  paperId: string;
  outputPath?: string;
  extension: 'pdf' | 'md';
}

/**
 * Recursively creates a directory if it doesn't exist.
 *
 * Accepts absolute or relative paths. No-op if directory already exists.
 *
 * @param dirPath - Path to the directory to create.
 * @throws Error with descriptive message if directory creation fails.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create directory "${dirPath}": ${message}`);
  }
}

/**
 * Removes or replaces unsafe characters from a filename.
 *
 * Replaces `: / \ ? * " < > |` with `-`, collapses multiple dashes
 * to a single dash, and trims leading/trailing dashes.
 *
 * Synchronous — pure string transformation, no I/O.
 *
 * @param filename - Raw filename to sanitize.
 * @returns Sanitized filename safe for all major filesystems.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/:\\?*"<>|]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolves the absolute path where a paper should be saved.
 *
 * If `outputPath` is provided, validates it ends with the correct extension
 * and returns its absolute path.
 *
 * If `outputPath` is NOT provided, defaults to:
 *   `process.env.IGS_PAPERS_DIR` || `${os.homedir()}/.config/igs-mcp/papers/`
 *
 * The default filename is the sanitized paperId plus the extension.
 *
 * @param input - Paper path resolution input.
 * @returns Absolute path string for the paper file.
 * @throws Error if outputPath is provided but has wrong extension.
 */
export async function resolvePaperPath(input: ResolvePaperPathInput): Promise<string> {
  const { paperId, outputPath, extension } = input;

  if (outputPath) {
    const absPath = path.resolve(outputPath);
    if (!absPath.endsWith(`.${extension}`)) {
      throw new Error(
        `Output path "${outputPath}" must end with ".${extension}", but got "${path.extname(absPath) || '(no extension)'}".`
      );
    }
    return absPath;
  }

  const papersDir = process.env.IGS_PAPERS_DIR || path.join(os.homedir(), '.config', 'igs-mcp', 'papers');
  await ensureDir(papersDir);

  const safeName = sanitizeFilename(paperId);
  const filename = safeName ? `${safeName}.${extension}` : `paper.${extension}`;

  return path.resolve(papersDir, filename);
}
