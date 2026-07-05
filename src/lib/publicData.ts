import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { historyResults, topUpProducts } from '@/lib/mockData';
import type {
  LotteryDraw,
  LotteryGame,
  LotteryResult,
  LotteryState,
  TopUpCarrier,
  TopUpProduct,
} from '@/lib/types';

export type LotteryResultsDateFilter = 'Any' | 'Today' | 'Yesterday' | 'Older';

export type LotteryResultsFilters = {
  state?: LotteryState | 'All';
  game?: LotteryGame | 'All';
  draw?: LotteryDraw | 'All';
  date?: LotteryResultsDateFilter;
};

type LotteryResultRow = {
  id: string;
  state: LotteryState;
  game: LotteryGame;
  draw: LotteryDraw;
  result_date: string;
  numbers: string[];
  source: string;
  created_at?: string;
};

type TopUpProductRow = {
  id: string;
  carrier: TopUpCarrier;
  product_type: TopUpProduct['productType'];
  name: string;
  bundle_label: string | null;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd?: number | string;
  active: boolean;
  external_provider?: string | null;
  external_product_id?: string | null;
  external_product_metadata?: Record<string, unknown> | null;
};

const mockDateBuckets = {
  today: '2026-07-03',
  yesterday: '2026-07-02',
} as const;

export async function fetchLatestLotteryResults(): Promise<LotteryResult[]> {
  const results = await loadLotteryResults();
  return results;
}

export async function fetchLotteryResults(filters: LotteryResultsFilters = {}): Promise<LotteryResult[]> {
  const results = await loadLotteryResults();
  return applyLotteryFilters(results, filters);
}

export async function fetchActiveTopUpProducts(): Promise<TopUpProduct[]> {
  if (!isSupabaseConfigured || !supabase) {
    return topUpProducts;
  }

  try {
    const { data, error } = await supabase
      .from('topup_products')
      .select(
        'id, carrier, product_type, name, bundle_label, amount_usd, service_fee_usd, active, external_provider, external_product_id, external_product_metadata'
      )
      .eq('active', true)
      .order('carrier', { ascending: true })
      .order('product_type', { ascending: true })
      .order('amount_usd', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as TopUpProductRow[];
    return rows.map(mapTopUpProductRow);
  } catch (error) {
    reportFallback('top-up products', error);
    return topUpProducts;
  }
}

export function applyLotteryFilters(
  results: LotteryResult[],
  filters: LotteryResultsFilters
): LotteryResult[] {
  return results.filter((result) => {
    const matchesState = !filters.state || filters.state === 'All' || result.state === filters.state;
    const matchesGame = !filters.game || filters.game === 'All' || result.game === filters.game;
    const matchesDraw = !filters.draw || filters.draw === 'All' || result.draw === filters.draw;
    const matchesDate =
      !filters.date ||
      filters.date === 'Any' ||
      (filters.date === 'Today' && result.date === mockDateBuckets.today) ||
      (filters.date === 'Yesterday' && result.date === mockDateBuckets.yesterday) ||
      (filters.date === 'Older' && result.date < mockDateBuckets.yesterday);

    return matchesState && matchesGame && matchesDraw && matchesDate;
  });
}

async function loadLotteryResults(): Promise<LotteryResult[]> {
  if (!isSupabaseConfigured || !supabase) {
    return sortLotteryResults([...historyResults]);
  }

  try {
    const { data, error } = await supabase
      .from('lottery_results')
      .select('id, state, game, draw, result_date, numbers, source, created_at')
      .order('result_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as LotteryResultRow[];
    return sortLotteryResults(rows.map(mapLotteryResultRow));
  } catch (error) {
    reportFallback('lottery results', error);
    return sortLotteryResults([...historyResults]);
  }
}

function mapLotteryResultRow(row: LotteryResultRow): LotteryResult {
  return {
    id: row.id,
    state: row.state,
    game: row.game,
    draw: row.draw,
    date: row.result_date,
    winningNumbers: row.numbers.map(String),
  };
}

function mapTopUpProductRow(row: TopUpProductRow): TopUpProduct {
  const price = Number(row.amount_usd);
  const serviceFee = Number(row.service_fee_usd);
  return {
    id: row.id,
    carrier: row.carrier,
    productType: row.product_type,
    label: row.bundle_label ?? formatCurrency(price),
    price,
    serviceFee,
    externalProvider: row.external_provider ?? null,
    externalProductId: row.external_product_id ?? null,
    externalProductMetadata: row.external_product_metadata ?? null,
  };
}

function sortLotteryResults(results: LotteryResult[]) {
  return results.sort((left, right) => {
    if (left.date === right.date) {
      return left.id.localeCompare(right.id);
    }

    return left.date < right.date ? 1 : -1;
  });
}

function formatCurrency(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function reportFallback(sourceName: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.warn(`[boulio] Falling back to mock ${sourceName}. ${message}`);
}
