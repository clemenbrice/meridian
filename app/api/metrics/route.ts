import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { queryMetrics, getNetworks } from '@/lib/db';
import {
  computeKPIs,
  aggregateByNetwork,
  aggregateByDay,
  aggregateByCampaign,
  aggregateAmazonFunnel,
  pctChange,
} from '@/lib/calculations';
import { subDays, format } from 'date-fns';

function getDateRange(range: string, customStart?: string, customEnd?: string) {
  const today = new Date();
  const end = format(today, 'yyyy-MM-dd');

  switch (range) {
    case '7d':
      return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end };
    case '30d':
      return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end };
    case '90d':
      return { start: format(subDays(today, 90), 'yyyy-MM-dd'), end };
    case 'custom':
      if (!customStart || !customEnd) throw new Error('custom range requires start and end');
      return { start: customStart, end: customEnd };
    default:
      return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end };
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const range = sp.get('range') ?? '30d';
    const customStart = sp.get('start') ?? undefined;
    const customEnd = sp.get('end') ?? undefined;
    const networksParam = sp.get('networks');
    const networks = networksParam ? networksParam.split(',').filter(Boolean) : undefined;

    const { start, end } = getDateRange(range, customStart, customEnd);

    const days = Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
    );
    const priorEnd = format(subDays(new Date(start), 1), 'yyyy-MM-dd');
    const priorStart = format(subDays(new Date(start), days + 1), 'yyyy-MM-dd');

    const currentRows = queryMetrics(start, end, networks);
    const priorRows = queryMetrics(priorStart, priorEnd, networks);

    const currentKPIs = computeKPIs(currentRows);
    const priorKPIs = computeKPIs(priorRows);

    const kpiChanges = {
      spendChange: pctChange(currentKPIs.totalSpend, priorKPIs.totalSpend),
      roasChange: pctChange(currentKPIs.blendedROAS, priorKPIs.blendedROAS),
      ordersChange: pctChange(currentKPIs.totalOrders, priorKPIs.totalOrders),
      ntbRateChange: pctChange(currentKPIs.ntbRate, priorKPIs.ntbRate),
      ctrChange: pctChange(currentKPIs.ctr, priorKPIs.ctr),
      cpcChange: currentKPIs.cpc !== null && priorKPIs.cpc !== null
        ? pctChange(currentKPIs.cpc, priorKPIs.cpc)
        : null,
    };

    return NextResponse.json({
      dateRange: { start, end, priorStart, priorEnd },
      kpis: currentKPIs,
      kpiChanges,
      byNetwork: aggregateByNetwork(currentRows),
      byDay: aggregateByDay(currentRows),
      topCampaigns: aggregateByCampaign(currentRows),
      funnelData: aggregateAmazonFunnel(currentRows),
      availableNetworks: getNetworks(),
    });
  } catch (err) {
    console.error('[metrics]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load metrics' },
      { status: 500 }
    );
  }
}
