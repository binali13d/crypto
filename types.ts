export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: null | {
    times: number;
    currency: string;
    percentage: number;
  };
  last_updated: string;
  sparkline_in_7d: {
    price: number[];
  };
}

export interface PortfolioHolding {
  id: string; // coin.id
  coin: Coin;
  quantity: number;
  buyPrice: number;
  stopLoss?: number;
}

export enum MessageSender {
  USER = 'user',
  AI = 'ai',
}

export interface ChatMessage {
  sender: MessageSender;
  text: string;
}

export enum AppView {
  Dashboard = 'Dashboard',
  Portfolio = 'Portfolio',
  OpportunityHunter = 'OpportunityHunter',
  UmmAlAkhbar = 'UmmAlAkhbar',
  AiChat = 'AiChat',
  Alerts = 'Alerts',
  Settings = 'Settings',
}

export interface TriggeredAlert {
  id: string;
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  description: string;
  triggeredAt: number; // timestamp
}

export enum AdvancedAlertCondition {
  ABOVE = 'above',
  BELOW = 'below',
}

interface AdvancedAlertBase {
  id: string;
  coinId: string;
}

export interface RsiAlert extends AdvancedAlertBase {
  type: 'rsi';
  condition: AdvancedAlertCondition;
  value: number;
  period: number;
}

export interface MaCrossAlert extends AdvancedAlertBase {
  type: 'ma_cross';
  shortPeriod: number;
  longPeriod: number;
}

export interface ListingAlert extends AdvancedAlertBase {
    type: 'listing';
    exchange: 'Binance' | 'Coinbase' | 'Kraken';
}

export type AdvancedAlert = RsiAlert | MaCrossAlert | ListingAlert;

export interface NewsArticle {
  id: string;
  url: string;
  title: string;
  published_on: number; // timestamp
  source_info: {
    name: string;
  };
  body: string;
  tags: string;
  categories: string;
}

export interface PortfolioHistoryPoint {
  timestamp: number;
  value: number;
}

export interface OpportunityBreakdown {
  onChainScore: number;
  onChainReason: string;
  socialScore: number;
  socialReason: string;
  volumeScore: number;
  volumeReason: string;
  devScore: number;
  devReason: string;
}

export interface Opportunity {
  coin: Coin;
  score: number;
  breakdown: OpportunityBreakdown;
}

export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TradePlan {
    direction: 'Long' | 'Short';
    entry: number;
    stopLoss: number;
    targets: { level: number; price: number }[];
}

export interface BreakoutSignal {
  coin: Coin;
  time: number;
  timeframe: string;
  direction: 'Long' | 'Short';
  entryPrice: number;
  targets: number[];
  stopLoss: number;
  strength: number; // Volume ratio, e.g., 2.5
}

export interface SoundOption {
  name: string;
  url: string;
}

export interface AppSettings {
  isSoundEnabled: boolean;
  selectedSound: SoundOption;
}