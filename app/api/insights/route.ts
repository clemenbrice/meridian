import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { queryMetrics } from '@/lib/db';
import { computeKPIs, aggregateByNetwork, aggregateByCampaign, formatCurrency, formatROAS, formatPct } from '@/lib/calculations';
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

    const spendChg = priorKpis.totalSpend > 0
      ? ((kpis.totalSpend - priorKpis.totalSpend) / priorKpis.totalSpend * 100).toFixed(1)
      : 'N/A';
    const roasChg = priorKpis.blendedROAS > 0
      ? ((kpis.blendedROAS - priorKpis.blendedROAS) / priorKpis.blendedROAS * 100).toFixed(1)
      : 'N/A';

    const networkSummary = byNetwork.map(n =>
      `${n.network}: spend ${formatCurrency(n.spend)}, ROAS ${formatROAS(n.roas)}, orders ${n.orders}`
    ).join('\n');

    const topCampaignSummary = topCampaigns.slice(0, 5).map((c, i) =>
      `${i + 1}. ${c.campaign_name} (${c.network}): ROAS ${formatROAS(c.roas)}, spend ${formatCurrency(c.spend)}`
    ).join('\n');

    const prompt = `You are an expert retail media analyst. Here is performance data for the period ${start} to ${end}:

OVERALL PERFORMANCE:
- Total Spend: ${formatCurrency(kpis.totalSpend)} (${spendChg}% vs prior period)
- Blended ROAS: ${formatROAS(kpis.blendedROAS)} (${roasChg}% vs prior period)
- Total Orders: ${kpis.totalOrders.toLocaleString()}
- New-to-Brand Rate: ${formatPct(kpis.ntbRate)}
- Total Impressions: ${kpis.totalImpressions.toLocaleString()}

BY NETWORK:
${networkSummary}

TOP CAMPAIGNS BY ROAS:
${topCampaignSummary}

PRIOR PERIOD (${priorStart} to ${priorEnd}):
- Total Spend: ${formatCurrency(priorKpis.totalSpend)}
- Blended ROAS: ${formatROAS(priorKpis.blendedROAS)}
- Total Orders: ${priorKpis.totalOrders.toLocaleString()}
- New-to-Brand Rate: ${formatPct(priorKpis.ntbRate)}

Write a 3-5 sentence plain-English executive summary highlighting:
1. The top performing network or campaign
2. The biggest opportunity for improvement
3. Notable week-over-week or period-over-period change
4. New-to-brand trend and what it means for customer acquisition

Be specific with numbers. Write as if briefing a VP of Marketing. Do not use bullet points — write in flowing prose.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
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
