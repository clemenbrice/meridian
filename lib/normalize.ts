import { NormalizedRow } from './db';

// Each network exports CSV with different column names.
// These maps translate network-specific headers → our unified schema.

type FieldMap = Record<string, keyof NormalizedRow | null>;

const AMAZON_MAP: FieldMap = {
  'Date': 'date',
  'Campaign Name': 'campaign_name',
  'Campaign ID': 'campaign_id',
  'Total Spend ($)': 'ad_spend',
  'Impressions': 'impressions',
  'Clicks': 'clicks',
  'Attributed Sales (14d)': 'attributed_revenue',
  'Attributed Orders (14d)': 'attributed_orders',
  'New-to-Brand Orders': 'new_to_brand_orders',
  'New-to-Brand Sales': 'new_to_brand_revenue',
};

const WALMART_MAP: FieldMap = {
  'report_date': 'date',
  'campaign': 'campaign_name',
  'campaign_id': 'campaign_id',
  'spend': 'ad_spend',
  'total_impressions': 'impressions',
  'total_clicks': 'clicks',
  'attributed_revenue_14d': 'attributed_revenue',
  'attributed_units_14d': 'attributed_orders',
  'new_buyer_orders': 'new_to_brand_orders',
  'new_buyer_revenue': 'new_to_brand_revenue',
};

const CRITEO_MAP: FieldMap = {
  'Day': 'date',
  'CampaignName': 'campaign_name',
  'CampaignId': 'campaign_id',
  'Cost': 'ad_spend',
  'Displays': 'impressions',
  'Clicks': 'clicks',
  'Revenue': 'attributed_revenue',
  'Orders': 'attributed_orders',
  'NewCustomerOrders': 'new_to_brand_orders',
  'NewCustomerRevenue': 'new_to_brand_revenue',
};

const NETWORK_MAPS: Record<string, FieldMap> = {
  amazon: AMAZON_MAP,
  walmart: WALMART_MAP,
  criteo: CRITEO_MAP,
};

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDate(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try native Date parse
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  return s;
}

export function normalizeRows(
  network: string,
  rawRows: Record<string, unknown>[]
): NormalizedRow[] {
  const map = NETWORK_MAPS[network.toLowerCase()];
  if (!map) throw new Error(`Unknown network: ${network}`);

  const results: NormalizedRow[] = [];

  for (const raw of rawRows) {
    const row: Partial<NormalizedRow> = {};

    for (const [srcCol, destField] of Object.entries(map)) {
      if (!destField) continue;
      const val = raw[srcCol];
      if (val === undefined) continue;

      if (destField === 'date') {
        row.date = parseDate(val);
      } else if (destField === 'campaign_name' || destField === 'campaign_id') {
        row[destField] = String(val ?? '').trim();
      } else {
        (row as Record<string, number>)[destField] = parseNum(val);
      }
    }

    // Skip rows with missing required fields
    if (!row.date || !row.campaign_name) continue;

    results.push({
      campaign_name: row.campaign_name ?? '',
      campaign_id: row.campaign_id,
      date: row.date,
      ad_spend: row.ad_spend ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      attributed_revenue: row.attributed_revenue ?? 0,
      attributed_orders: row.attributed_orders ?? 0,
      new_to_brand_orders: row.new_to_brand_orders ?? 0,
      new_to_brand_revenue: row.new_to_brand_revenue ?? 0,
    });
  }

  return results;
}

export const SUPPORTED_NETWORKS = ['amazon', 'walmart', 'criteo'] as const;
export type Network = typeof SUPPORTED_NETWORKS[number];
