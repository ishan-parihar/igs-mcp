export type Pool = {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
};

export type Source = {
  id: string;
  name: string;
  type: 'rss' | 'http';
  url: string;
  headers?: Record<string, string>;
  parser?: string;
  parserConfig?: {
    listUrl?: string;
    selectors?: {
      item: string;
      title?: string;
      link?: string;
      date?: string;
      desc?: string;
    };
  };
  pools: string[];
  countries: string[];
  cities: string[];
  domains: string[];
  is_active: boolean;
  sourceCategory: 'news' | 'community' | 'research';
};

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string; // ISO string
  source_name: string;
  pool_id: string;
  content_snippet: string;
  author?: string;
  media_url?: string;
  raw?: unknown;
};

export type FetchOptions = {
  pools?: string[];
  sources?: string[];
  start?: string; // ISO
  end?: string;   // ISO
  limit?: number;
  cacheMode?: 'prefer' | 'bypass' | 'only';
  includeRaw?: boolean;
};
