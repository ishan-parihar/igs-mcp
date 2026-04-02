import { pipeline } from '@xenova/transformers';

/**
 * Embedding generator using sentence transformers.
 * Generates 384-dimensional embeddings for semantic search and clustering.
 * Model is loaded lazily on first use and cached for subsequent calls.
 */
export class EmbeddingGenerator {
  private extractor: any = null;
  private modelLoaded = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Load the feature extraction model.
   * Uses lazy loading - model is downloaded and cached on first call.
   */
  async load(): Promise<void> {
    if (this.modelLoaded) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        this.extractor = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2'
        );
        this.modelLoaded = true;
        console.log('[EmbeddingGenerator] Model loaded successfully');
      } catch (error) {
        console.error('[EmbeddingGenerator] Failed to load model:', error);
        this.modelLoaded = false;
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embedding for a single text.
   * @param text - The text to embed (title + content snippet recommended)
   * @returns 384-dimensional embedding vector
   */
  async generate(text: string): Promise<number[]> {
    await this.load();

    if (!this.extractor) {
      throw new Error('Embedding generator not initialized');
    }

    try {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert Tensor data to flat array
      return Array.from(output.data);
    } catch (error) {
      console.error('[EmbeddingGenerator] Embedding generation failed:', error);
      return [];
    }
  }

  /**
   * Generate embeddings for multiple texts.
   * @param texts - Array of texts to embed
   * @returns Array of embeddings (one per input text)
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generate(text)));
  }

  /**
   * Check if the model is loaded and ready.
   */
  isReady(): boolean {
    return this.modelLoaded && this.extractor !== null;
  }
}

/**
 * Calculate cosine similarity between two embedding vectors.
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity score (0.0 to 1.0 for normalized vectors)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find most similar embeddings to a query embedding.
 * @param queryEmbedding - The query embedding vector
 * @param candidates - Array of candidate embeddings
 * @param topK - Maximum number of results to return
 * @returns Array of {index, score} pairs sorted by similarity (descending)
 */
export function findSimilarEmbeddings(
  queryEmbedding: number[],
  candidates: number[][],
  topK: number = 10
): Array<{ index: number; score: number }> {
  const scores = candidates.map((embedding, index) => ({
    index,
    score: cosineSimilarity(queryEmbedding, embedding),
  }));

  return scores.sort((a, b) => b.score - a.score).slice(0, topK);
}

// Singleton instance for application-wide use
export const embeddingGenerator = new EmbeddingGenerator();
