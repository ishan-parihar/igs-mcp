import { pipeline } from '@xenova/transformers';

export const DOMAIN_LABELS = [
  'breaking', 'geopolitics', 'finance', 'business', 'tech',
  'cyber', 'science', 'health', 'environment', 'energy',
  'law', 'culture', 'india-domestic', 'local',
];

export type DomainLabel = (typeof DOMAIN_LABELS)[number];

export interface DomainClassification {
  domain: DomainLabel;
  score: number;
}

interface WeightedKeyword {
  keyword: string;
  weight: number;
}

/**
 * Domain classifier using keyword-based rules.
 * Fast, deterministic, works offline without heavy ML models.
 */
export class DomainClassifier {
  private keywordMaps: Map<DomainLabel, WeightedKeyword[]> = new Map();
  private loaded = false;

  constructor() {
    this.initializeKeywords();
  }

  private initializeKeywords(): void {
    const addKeywords = (domain: DomainLabel, pairs: [string, number?][]) => {
      const weighted = pairs.map(([keyword, weight]) => ({
        keyword,
        weight: weight || 1.0
      }));
      this.keywordMaps.set(domain, weighted);
    };

    addKeywords('breaking', [['breaking'], ['urgent'], ['just in'], ['developing'], ['live'], ['alert'], ['flash']]);
    
    addKeywords('geopolitics', [
      ['sanctions', 2.0], ['diplomatic'], ['embassy'], ['treaty'], ['summit', 1.5],
      ['foreign policy', 2.0], ['state department'], ['ambassador'], ['nato'],
      ['united nations', 1.5], ['geopolitical', 2.0], ['bilateral'], ['multilateral']
    ]);
    
    addKeywords('finance', [
      ['stock market', 2.0], ['trading'], ['investor'], ['shares'], ['bonds'],
      ['fed', 1.5], ['interest rate', 1.5], ['inflation', 1.5], ['currency'], ['forex'],
      ['wall street', 1.5], ['nasdaq'], ['earnings', 1.3], ['revenue']
    ]);
    
    addKeywords('business', [
      ['company'], ['corporate'], ['ceo'], ['industry'], ['manufacturing'],
      ['supply chain', 1.3], ['retail'], ['market share'], ['quarterly']
    ]);
    
    addKeywords('tech', [
      ['technology', 1.3], ['software'], ['hardware'], ['artificial intelligence', 2.0],
      ['ai', 2.0], ['machine learning', 1.8], ['smartphone'], ['app'],
      ['cloud computing', 1.5], ['semiconductor', 1.5], ['chip', 1.5], ['processor']
    ]);
    
    addKeywords('cyber', [
      ['cybersecurity', 2.0], ['hack', 1.8], ['breach', 1.5], ['ransomware', 2.0],
      ['malware'], ['cisa', 1.8], ['vulnerability'], ['zero-day', 1.8],
      ['cyber attack', 2.0], ['data breach', 1.8], ['phishing'], ['apt', 1.5]
    ]);
    
    addKeywords('science', [['research'], ['study'], ['scientist'], ['laboratory'], ['nasa'], ['space', 1.5]]);
    addKeywords('health', [['healthcare'], ['medical'], ['disease'], ['hospital'], ['who'], ['vaccine', 1.5], ['fda']]);
    addKeywords('environment', [['climate', 1.5], ['carbon'], ['emissions'], ['renewable'], ['pollution']]);
    addKeywords('energy', [['oil', 1.3], ['gas'], ['petroleum'], ['opec', 1.5], ['lng'], ['crude'], ['refinery']]);
    addKeywords('law', [['court'], ['lawsuit'], ['legal'], ['judge'], ['legislation'], ['regulation', 1.3]]);
    addKeywords('culture', [['culture'], ['arts'], ['museum'], ['entertainment'], ['media'], ['film']]);
    addKeywords('india-domestic', [['india', 1.3], ['delhi'], ['mumbai'], ['parliament'], ['modi'], ['rbi'], ['sebi']]);
    addKeywords('local', [['city'], ['municipal'], ['mayor'], ['neighborhood'], ['community']]);

    this.loaded = true;
  }

  async classify(text: string, topK: number = 5, minScore: number = 0.25): Promise<DomainClassification[]> {
    if (!this.loaded) this.initializeKeywords();

    const textLower = text.toLowerCase();
    const scores: DomainClassification[] = [];

    for (const [domain, keywords] of this.keywordMaps.entries()) {
      let score = 0;
      for (const { keyword, weight } of keywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = textLower.match(regex);
        if (matches) {
          score += matches.length * 0.2 * weight;
        }
      }
      if (score > 0) {
        scores.push({ domain, score: Math.min(0.99, score) });
      }
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK).filter(c => c.score >= minScore);
  }

  async classifyBatch(texts: string[], topK: number = 5): Promise<DomainClassification[][]> {
    return Promise.all(texts.map(t => this.classify(t, topK)));
  }

  isReady(): boolean {
    return this.loaded;
  }
}

export const domainClassifier = new DomainClassifier();
