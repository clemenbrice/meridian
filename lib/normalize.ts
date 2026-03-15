import { NormalizedRow } from './db';

// Each network exports with different column names.
// These maps translate network-specific headers → our unified schema.

type DestField = keyof NormalizedRow | null;
type FieldMap = Record<string, DestField>;

// Fields that should be coerced to strings (not numbers)
const STRING_FIELDS = new Set(['campaign_name', 'campaign_id', 'campaign_type', 'placement']);
// Fields that should be nullable integers (null when missing, not 0)
const NULLABLE_INT_FIELDS = new Set(['detail_page_views', 'add_to_cart']);

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
  'Detail Page Views': 'detail_page_views',
  'Add to Cart': 'add_to_cart',
  'Campaign Type': 'campaign_type',
  'Placement': 'placement',
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
  'Ad Type': 'campaign_type',
  'Placement': 'placement',
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
  'Creative Format': 'campaign_type',
  'Placement Type': 'placement',
};

const NETWORK_MAPS: Record<string, FieldMap> = {
  amazon: AMAZON_MAP,
  walmart: WALMART_MAP,
  criteo: CRITEO_MAP,
};

// Hardcoded values applied after column mapping (not read from the file)
const NETWORK_ATTRIBUTED_WINDOW: Record<string, string> = {
  amazon: '14d',
  walmart: '14d',
  criteo: '14d',
};

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseNullableInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return Math.round(n);
}

function parseDate(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
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

  const attributedWindow = NETWORK_ATTRIBUTED_WINDOW[network.toLowerCase()] ?? '14d';
  const results: NormalizedRow[] = [];

  for (const raw of rawRows) {
    const row: Partial<NormalizedRow> = {};

    for (const [srcCol, destField] of Object.entries(map)) {
      if (!destField) continue;
      const val = raw[srcCol];
      if (val === undefined) continue;

      if (destField === 'date') {
        row.date = parseDate(val);
      } else if (STRING_FIELDS.has(destField)) {
        (row as Record<string, string>)[destField] = String(val ?? '').trim();
      } else if (NULLABLE_INT_FIELDS.has(destField)) {
        (row as Record<string, number | null>)[destField] = parseNullableInt(val);
      } else {
        (row as Record<string, number>)[destField] = parseNum(val);
      }
    }

    if (!row.date || !row.campaign_name) continue;

    const ad_spend = row.ad_spend ?? 0;
    const impressions = row.impressions ?? 0;
    const clicks = row.clicks ?? 0;
    const attributed_revenue = row.attributed_revenue ?? 0;
    const attributed_orders = row.attributed_orders ?? 0;
    const new_to_brand_orders = row.new_to_brand_orders ?? 0;
    const new_to_brand_revenue = row.new_to_brand_revenue ?? 0;

    // Compute derived metrics — null on division by zero (never store Infinity or NaN)
    const ctr = impressions > 0 ? clicks / impressions : null;
    const cpc = clicks > 0 ? ad_spend / clicks : null;
    const roas = ad_spend > 0 ? attributed_revenue / ad_spend : null;
    const ntb_rate = attributed_orders > 0 ? new_to_brand_orders / attributed_orders : null;

    results.push({
      campaign_name: row.campaign_name ?? '',
      campaign_id: row.campaign_id,
      date: row.date,
      ad_spend,
      impressions,
      clicks,
      attributed_revenue,
      attributed_orders,
      new_to_brand_orders,
      new_to_brand_revenue,
      ctr,
      cpc,
      roas,
      ntb_rate,
      detail_page_views: row.detail_page_views ?? null,
      add_to_cart: row.add_to_cart ?? null,
      campaign_type: row.campaign_type ?? null,
      placement: row.placement ?? null,
      attributed_window: attributedWindow,
    });
  }

  return results;
}

export const SUPPORTED_NETWORKS = ['amazon', 'walmart', 'criteo'] as const;
export type Network = typeof SUPPORTED_NETWORKS[number];
