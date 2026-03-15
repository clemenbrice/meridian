import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { queryMetrics } from '@/lib/db';
import {
  computeKPIs,
  aggregateByNetwork,
  aggregateByCampaign,
  aggregateAmazonFunnel,
  formatCurrency,
  formatROAS,
  formatPct,
} from '@/lib/calculations';
import { subDays, format } from 'date-fns';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { start, end } = body;

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end dates required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const days = Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
    );
    const priorEnd = format(subDays(new Date(start), 1), 'yyyy-MM-dd');
    const priorStart = format(subDays(new Date(start), days + 1), 'yyyy-MM-dd');

    const currentRows = queryMetrics(start, end);
    const priorRows = queryMetrics(priorStart, priorEnd);

    if (currentRows.length === 0) {
      return NextResponse.json({ error: 'No data available for selected period' }, { status: 400 });
    }

    const kpis = computeKPIs(currentRows);
    const priorKpis = computeKPIs(priorRows);
    const byNetwork = aggregateByNetwork(currentRows);
    const topCampaigns = aggregateByCampaign(currentRows);
    const funnel = aggregateAmazonFunnel(currentRows);

    const spendChg = priorKpis.totalSpend > 0
      ? ((kpis.totalSpend - priorKpis.totalSpend) / priorKpis.totalSpend * 100).toFixed(1)
      : 'N/A';
    const roasChg = priorKpis.blendedROAS > 0
      ? ((kpis.blendedROAS - priorKpis.blendedROAS) / priorKpis.blendedROAS * 100).toFixed(1)
      : 'N/A';
    const ntbChg = priorKpis.ntbRate > 0
      ? ((kpis.ntbRate - priorKpis.ntbRate) / priorKpis.ntbRate * 100).toFixed(1)
      : 'N/A';

    const networkSummary = byNetwork.map(n =>
      `${n.network} (14d attribution): spend ${formatCurrency(n.spend)}, ROAS ${formatROAS(n.roas)}, orders ${n.orders}`
    ).join('\n');

    const topCampaignSummary = topCampaigns.slice(0, 5).map((c, i) =>
      `${i + 1}. ${c.campaign_name} (${c.network}): ROAS ${formatROAS(c.roas)}, spend ${formatCurrency(c.spend)}, NTB rate ${(c.ntbRate * 100).toFixed(1)}%, CTR ${(c.ctr * 100).toFixed(2)}%`
    ).join('\n');

    const funnelSection = funnel
      ? `\nAMAZON PURCHASE FUNNEL (14d attribution):
- Impressions: ${funnel.impressions.toLocaleString()}
- Detail Page Views: ${funnel.detailPageViews.toLocaleString()} (${funnel.impressions > 0 ? ((funnel.detailPageViews / funnel.impressions) * 100).toFixed(2) : '0'}% of impressions)
- Add to Cart: ${funnel.addToCart.toLocaleString()} (${funnel.detailPageViews > 0 ? ((funnel.addToCart / funnel.detailPageViews) * 100).toFixed(1) : '0'}% of DPV)
- Orders: ${funnel.orders.toLocaleString()} (${funnel.addToCart > 0 ? ((funnel.orders / funnel.addToCart) * 100).toFixed(1) : '0'}% of Add-to-Cart)`
      : '';

    const prompt = `You are an expert retail media analyst. Here is performance data for the period ${start} to ${end}:

OVERALL PERFORMANCE (note: all networks on 14-day attribution window):
- Total Spend: ${formatCurrency(kpis.totalSpend)} (${spendChg}% vs prior period)
- Blended ROAS: ${formatROAS(kpis.blendedROAS)} (${roasChg}% vs prior period)
- Total Orders: ${kpis.totalOrders.toLocaleString()}
- New-to-Brand Rate: ${formatPct(kpis.ntbRate)} (${ntbChg}% vs prior period)
- Blended CTR: ${(kpis.ctr * 100).toFixed(2)}%
- Blended CPC: ${kpis.cpc !== null ? formatCurrency(kpis.cpc) : 'N/A'}
- Total Impressions: ${kpis.totalImpressions.toLocaleString()}
${funnelSection}
BY NETWORK:
${networkSummary}

TOP CAMPAIGNS BY ROAS:
${topCampaignSummary}

PRIOR PERIOD (${priorStart} to ${priorEnd}):
- Total Spend: ${formatCurrency(priorKpis.totalSpend)}
- Blended ROAS: ${formatROAS(priorKpis.blendedROAS)}
- Total Orders: ${priorKpis.totalOrders.toLocaleString()}
- New-to-Brand Rate: ${formatPct(priorKpis.ntbRate)}
- Blended CTR: ${(priorKpis.ctr * 100).toFixed(2)}%

Write a 3-5 sentence plain-English executive summary highlighting:
1. Top performing network or campaign, with specific ROAS numbers
2. NTB rate trend — is the brand growing its customer base or relying on repeat buyers?
3. CTR vs CPC efficiency — are we paying more or less per click, and is engagement improving?
4. If Amazon funnel data is available, call out whether there is a weak conversion point (e.g. high DPV but low Add-to-Cart suggests a listing issue; high Add-to-Cart but low Orders suggests a checkout/price barrier)
5. One clear recommendation or flag for the media team

Note: when comparing across networks, remind the reader all networks are on 14-day attribution so comparisons are apples-to-apples.

Be specific with numbers. Write as if briefing a VP of Marketing. Do not use bullet points — write in flowing prose.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return NextResponse.json({ summary: text });
  } catch (err) {
    console.error('[insights]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate insights' },
      { status: 500 }
    );
  }
}
