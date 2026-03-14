import { MetricsRow } from './db';

export interface KPIs {
  totalSpend: number;
  totalRevenue: number;
  blendedROAS: number;
  totalOrders: number;
  ntbRate: number; // new-to-brand %
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  totalNtbOrders: number;
}

export interface NetworkAggregate {
  network: string;
  spend: number;
  revenue: number;
  roas: number;
  orders: number;
  impressions: number;
  clicks: number;
}

export interface DailyAggregate {
  date: string;
  spend: number;
  revenue: number;
}

export interface CampaignAggregate {
  campaign_name: string;
  network: string;
  spend: number;
  revenue: number;
  roas: number;
  orders: number;
  impressions: number;
  clicks: number;
  ntbOrders: number;
  ntbRate: number;
}

export function computeKPIs(rows: MetricsRow[]): KPIs {
  let totalSpend = 0, totalRevenue = 0, totalOrders = 0,
    totalNtbOrders = 0, totalImpressions = 0, totalClicks = 0;

  for (const r of rows) {
    totalSpend += r.ad_spend;
    totalRevenue += r.attributed_revenue;
    totalOrders += r.attributed_orders;
    totalNtbOrders += r.new_to_brand_orders;
    totalImpressions += r.impressions;
    totalClicks += r.clicks;
  }

  return {
    totalSpend,
    totalRevenue,
    blendedROAS: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    totalOrders,
    ntbRate: totalOrders > 0 ? totalNtbOrders / totalOrders : 0,
    totalImpressions,
    totalClicks,
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    totalNtbOrders,
  };
}

export function aggregateByNetwork(rows: MetricsRow[]): NetworkAggregate[] {
  const map = new Map<string, NetworkAggregate>();

  for (const r of rows) {
    const existing = map.get(r.network) ?? {
      network: r.network,
      spend: 0, revenue: 0, roas: 0,
      orders: 0, impressions: 0, clicks: 0,
    };
    existing.spend += r.ad_spend;
    existing.revenue += r.attributed_revenue;
    existing.orders += r.attributed_orders;
    existing.impressions += r.impressions;
    existing.clicks += r.clicks;
    map.set(r.network, existing);
  }

  return Array.from(map.values()).map(n => ({
    ...n,
    roas: n.spend > 0 ? n.revenue / n.spend : 0,
  }));
}

export function aggregateByDay(rows: MetricsRow[]): DailyAggregate[] {
  const map = new Map<string, DailyAggregate>();

  for (const r of rows) {
    const existing = map.get(r.date) ?? { date: r.date, spend: 0, revenue: 0 };
    existing.spend += r.ad_spend;
    existing.revenue += r.attributed_revenue;
    map.set(r.date, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateByCampaign(rows: MetricsRow[]): CampaignAggregate[] {
  const map = new Map<string, CampaignAggregate>();

  for (const r of rows) {
    const key = `${r.network}::${r.campaign_name}`;
    const existing = map.get(key) ?? {
      campaign_name: r.campaign_name,
      network: r.network,
      spend: 0, revenue: 0, roas: 0,
      orders: 0, impressions: 0, clicks: 0,
      ntbOrders: 0, ntbRate: 0,
    };
    existing.spend += r.ad_spend;
    existing.revenue += r.attributed_revenue;
    existing.orders += r.attributed_orders;
    existing.impressions += r.impressions;
    existing.clicks += r.clicks;
    existing.ntbOrders += r.new_to_brand_orders;
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map(c => ({
      ...c,
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
      ntbRate: c.orders > 0 ? c.ntbOrders / c.orders : 0,
    }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 10);
}

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / prior;
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatROAS(n: number): string {
  return `${n.toFixed(2)}x`;
}
