import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import Anthropic from '@anthropic-ai/sdk';
import { queryMetrics } from '@/lib/db';
import {
  computeKPIs,
  aggregateByNetwork,
  aggregateByCampaign,
  aggregateAmazonFunnel,
  pctChange,
} from '@/lib/calculations';
import { subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

// ── colours ──────────────────────────────────────────────────────────────────
const C = {
  indigo:   '4F46E5',
  indigoDk: '3730A3',
  indigoLt: 'A5B4FC',
  indigoXl: 'CCCCFF',
  dark:     '111827',
  gray:     '374151',
  lgray:    '9CA3AF',
  white:    'FFFFFF',
  green:    '10B981',
  red:      'EF4444',
  amber:    'F59E0B',
  bgCard:   'F9FAFB',
  border:   'E5E7EB',
  amazon:   'F97316',
  walmart:  '3B82F6',
  criteo:   '10B981',
};

const NET_COLOR: Record<string, string> = {
  amazon: C.amazon, walmart: C.walmart, criteo: C.criteo,
};

// ── formatters ────────────────────────────────────────────────────────────────
function fmt$(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}
function fmtPct(n: number, d = 1) { return `${(n * 100).toFixed(d)}%`; }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
function fmtChange(n: number | null, invert = false): { text: string; color: string } {
  if (n === null) return { text: '— no prior data', color: C.lgray };
  const v = invert ? -n : n;
  return v >= 0
    ? { text: `▲ ${Math.abs(n * 100).toFixed(1)}% vs prior period`, color: C.green }
    : { text: `▼ ${Math.abs(n * 100).toFixed(1)}% vs prior period`, color: C.red };
}

// ── date range helper (mirrors /api/metrics) ─────────────────────────────────
function getDateRange(range: string, cStart?: string, cEnd?: string) {
  const today = new Date();
  const end = format(today, 'yyyy-MM-dd');
  switch (range) {
    case '7d':  return { start: format(subDays(today, 7),  'yyyy-MM-dd'), end };
    case '30d': return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end };
    case '90d': return { start: format(subDays(today, 90), 'yyyy-MM-dd'), end };
    case 'custom':
      if (!cStart || !cEnd) throw new Error('custom range requires start and end');
      return { start: cStart, end: cEnd };
    default:    return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end };
  }
}

// ── slide helper: adds header bar ─────────────────────────────────────────────
function addHeader(pptx: PptxGenJS, slide: PptxGenJS.Slide, title: string, dateRange: string) {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.55, fill: { color: C.indigo } });
  slide.addText(title,     { x: 0.35, y: 0.08, w: 9,   h: 0.38, fontSize: 15, bold: true,  color: C.white,  fontFace: 'Calibri' });
  slide.addText(dateRange, { x: 9.5,  y: 0.12, w: 3.5, h: 0.3,  fontSize: 9,  color: C.indigoXl, align: 'right', fontFace: 'Calibri' });
}

// ── main route ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const range        = sp.get('range') ?? '30d';
    const cStart       = sp.get('start') ?? undefined;
    const cEnd         = sp.get('end')   ?? undefined;
    const networksParam = sp.get('networks');
    const networks     = networksParam ? networksParam.split(',').filter(Boolean) : undefined;

    const { start, end } = getDateRange(range, cStart, cEnd);
    const drLabel = `${start}  —  ${end}`;

    const days      = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
    const priorEnd   = format(subDays(new Date(start), 1),        'yyyy-MM-dd');
    const priorStart = format(subDays(new Date(start), days + 1), 'yyyy-MM-dd');

    const currentRows = queryMetrics(start, end, networks);
    const priorRows   = queryMetrics(priorStart, priorEnd, networks);

    if (currentRows.length === 0) {
      return NextResponse.json({ error: 'No data for selected period' }, { status: 400 });
    }

    const kpis      = computeKPIs(currentRows);
    const priorKpis = computeKPIs(priorRows);
    const byNetwork  = aggregateByNetwork(currentRows);
    const campaigns  = aggregateByCampaign(currentRows).slice(0, 10);
    const funnel     = aggregateAmazonFunnel(currentRows);

    const changes = {
      spend:       pctChange(kpis.totalSpend,       priorKpis.totalSpend),
      revenue:     pctChange(kpis.totalRevenue,      priorKpis.totalRevenue),
      roas:        pctChange(kpis.blendedROAS,       priorKpis.blendedROAS),
      orders:      pctChange(kpis.totalOrders,       priorKpis.totalOrders),
      ntbRate:     pctChange(kpis.ntbRate,           priorKpis.ntbRate),
      ctr:         pctChange(kpis.ctr,               priorKpis.ctr),
      cpc:         kpis.cpc !== null && priorKpis.cpc !== null ? pctChange(kpis.cpc, priorKpis.cpc) : null,
      impressions: pctChange(kpis.totalImpressions,  priorKpis.totalImpressions),
    };

    // ── AI summary ────────────────────────────────────────────────────────────
    let aiSummary = '';
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const totalSpend = byNetwork.reduce((s, n) => s + n.spend, 0);
        const netLines = byNetwork.map(n =>
          `${n.network}: spend ${fmt$(n.spend)} (${((n.spend / totalSpend) * 100).toFixed(1)}%), ROAS ${n.roas.toFixed(2)}x, orders ${n.orders}`
        ).join('\n');
        const campLines = campaigns.slice(0, 5).map((c, i) =>
          `${i + 1}. ${c.campaign_name} (${c.network}): ROAS ${c.roas.toFixed(2)}x, spend ${fmt$(c.spend)}, NTB ${fmtPct(c.ntbRate)}`
        ).join('\n');
        const funnelLine = funnel
          ? `Amazon funnel: ${funnel.impressions.toLocaleString()} impressions → ${funnel.detailPageViews.toLocaleString()} DPV → ${funnel.addToCart.toLocaleString()} ATC → ${funnel.orders.toLocaleString()} orders`
          : '';
        const prompt = `You are an expert retail media analyst. Data for ${start} to ${end} (all on 14-day attribution):

OVERALL: Spend ${fmt$(kpis.totalSpend)}, ROAS ${kpis.blendedROAS.toFixed(2)}x, Orders ${kpis.totalOrders.toLocaleString()}, NTB Rate ${fmtPct(kpis.ntbRate)}, CTR ${fmtPct(kpis.ctr, 2)}

BY NETWORK:
${netLines}

TOP CAMPAIGNS:
${campLines}
${funnelLine}

Write a 3-4 sentence executive summary for a VP of Marketing. Be specific with numbers. No bullet points — flowing prose.`;

        const msg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        });
        aiSummary = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      } catch {
        aiSummary = 'AI insights unavailable for this period.';
      }
    }

    // ── Build PPTX ────────────────────────────────────────────────────────────
    const pptx = new PptxGenJS();
    pptx.layout  = 'LAYOUT_WIDE'; // 13.33 × 7.5 in
    pptx.author  = 'Meridian';
    pptx.title   = `Commerce Media Intelligence — ${start} to ${end}`;

    // ── Slide 1: Cover ────────────────────────────────────────────────────────
    {
      const s = pptx.addSlide();
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.indigo } });
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.8, w: '100%', h: 1.7,  fill: { color: C.indigoDk } });
      s.addText('Commerce Media Intelligence', {
        x: 0.8, y: 1.4, w: 11.7, h: 1.2,
        fontSize: 36, bold: true, color: C.white, fontFace: 'Calibri',
      });
      s.addText('Performance Report', {
        x: 0.8, y: 2.7, w: 11.7, h: 0.7,
        fontSize: 24, color: C.indigoXl, fontFace: 'Calibri',
      });
      s.addText(drLabel, {
        x: 0.8, y: 3.55, w: 8, h: 0.5,
        fontSize: 15, color: C.indigoLt, fontFace: 'Calibri',
      });
      s.addText(`Generated ${format(new Date(), 'MMMM d, yyyy')}  ·  Meridian`, {
        x: 0.8, y: 6.2, w: 11.7, h: 0.4,
        fontSize: 10, color: C.indigoLt, fontFace: 'Calibri',
      });
    }

    // ── Slide 2: Executive Summary (AI) ──────────────────────────────────────
    {
      const s = pptx.addSlide();
      addHeader(pptx, s, 'Executive Summary', drLabel);
      s.addText(aiSummary || 'No AI summary available — ensure ANTHROPIC_API_KEY is set.', {
        x: 0.5, y: 0.75, w: 12.3, h: 5.8,
        fontSize: 14, color: C.gray, fontFace: 'Calibri',
        valign: 'top', wrap: true, lineSpacingMultiple: 1.45,
      });
      s.addText('All networks on 14-day attribution window', {
        x: 0.5, y: 6.95, w: 12.3, h: 0.3,
        fontSize: 9, color: C.lgray, italic: true, fontFace: 'Calibri',
      });
    }

    // ── Slide 3: KPI Overview ─────────────────────────────────────────────────
    {
      const s = pptx.addSlide();
      addHeader(pptx, s, 'Key Performance Indicators', drLabel);

      const kpiItems = [
        { label: 'Total Spend',       value: fmt$(kpis.totalSpend),                           change: changes.spend,       invert: false },
        { label: 'Total Revenue',     value: fmt$(kpis.totalRevenue),                         change: changes.revenue,     invert: false },
        { label: 'Blended ROAS',      value: `${kpis.blendedROAS.toFixed(2)}x`,               change: changes.roas,        invert: false },
        { label: 'Total Orders',      value: kpis.totalOrders.toLocaleString(),               change: changes.orders,      invert: false },
        { label: 'NTB Rate',          value: fmtPct(kpis.ntbRate),                            change: changes.ntbRate,     invert: false },
        { label: 'Blended CTR',       value: fmtPct(kpis.ctr, 2),                             change: changes.ctr,         invert: false },
        { label: 'Blended CPC',       value: kpis.cpc !== null ? `$${kpis.cpc.toFixed(2)}` : '—', change: changes.cpc,   invert: true  },
        { label: 'Total Impressions', value: fmtK(kpis.totalImpressions),                    change: changes.impressions, invert: false },
      ];

      kpiItems.forEach((kpi, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 0.2  + col * 3.25;
        const y = 0.72 + row * 2.95;
        const w = 3.0;
        const h = 2.65;

        s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.bgCard }, line: { color: C.border, width: 1 } });
        s.addText(kpi.label, {
          x: x + 0.15, y: y + 0.15, w: w - 0.3, h: 0.3,
          fontSize: 9, color: C.lgray, fontFace: 'Calibri',
        });
        s.addText(kpi.value, {
          x: x + 0.15, y: y + 0.52, w: w - 0.3, h: 0.9,
          fontSize: 22, bold: true, color: C.dark, fontFace: 'Calibri',
        });
        const chg = fmtChange(kpi.change, kpi.invert);
        s.addText(chg.text, {
          x: x + 0.15, y: y + 1.55, w: w - 0.3, h: 0.35,
          fontSize: 9, color: chg.color, fontFace: 'Calibri',
        });
      });
    }

    // ── Slide 4: Network Performance ──────────────────────────────────────────
    {
      const s = pptx.addSlide();
      addHeader(pptx, s, 'Performance by Network', drLabel);

      const totalSpend = byNetwork.reduce((sum, n) => sum + n.spend, 0);

      // Table
      const headerRow = ['Network', 'Spend', 'Share', 'Revenue', 'ROAS', 'Orders', 'Impressions'].map(t => ({
        text: t,
        options: { bold: true, color: C.white, fill: { color: C.indigo }, align: 'center' as const },
      }));
      const dataRows = byNetwork.map(n => [
        { text: n.network.charAt(0).toUpperCase() + n.network.slice(1) },
        { text: fmt$(n.spend) },
        { text: `${((n.spend / totalSpend) * 100).toFixed(1)}%` },
        { text: fmt$(n.revenue) },
        { text: `${n.roas.toFixed(2)}x` },
        { text: n.orders.toLocaleString() },
        { text: fmtK(n.impressions) },
      ]);

      s.addTable([headerRow, ...dataRows], {
        x: 0.35, y: 0.7, w: 12.6,
        colW: [2.0, 1.9, 1.3, 1.9, 1.3, 1.5, 1.8], // sum = 11.7, padded to 12.6
        fontSize: 12,
        border: { type: 'solid', color: C.border, pt: 1 },
        fill: { color: C.white },
        rowH: 0.5,
        fontFace: 'Calibri',
      });

      // Spend-share colour bar
      const barY = 3.5;
      s.addText('Spend Distribution', {
        x: 0.35, y: barY - 0.35, w: 5, h: 0.28,
        fontSize: 10, bold: true, color: C.gray, fontFace: 'Calibri',
      });
      let barX = 0.35;
      const barW = 12.6;
      byNetwork.forEach(n => {
        const w = (n.spend / totalSpend) * barW;
        s.addShape(pptx.ShapeType.rect, {
          x: barX, y: barY, w, h: 0.45,
          fill: { color: NET_COLOR[n.network] ?? C.indigo },
        });
        if (w > 0.9) {
          s.addText(`${n.network}  ${((n.spend / totalSpend) * 100).toFixed(1)}%`, {
            x: barX + 0.06, y: barY + 0.04, w: w - 0.1, h: 0.36,
            fontSize: 9, bold: true, color: C.white, fontFace: 'Calibri',
          });
        }
        barX += w;
      });

      // Per-network mini stats below the bar
      byNetwork.forEach((n, i) => {
        const bx = 0.35 + i * 4.3;
        const by = barY + 0.65;
        s.addShape(pptx.ShapeType.rect, {
          x: bx, y: by, w: 4.0, h: 1.8,
          fill: { color: C.bgCard }, line: { color: C.border, width: 1 },
        });
        s.addShape(pptx.ShapeType.rect, { x: bx, y: by, w: 0.2, h: 1.8, fill: { color: NET_COLOR[n.network] ?? C.indigo } });
        s.addText(n.network.charAt(0).toUpperCase() + n.network.slice(1), {
          x: bx + 0.3, y: by + 0.12, w: 3.5, h: 0.28,
          fontSize: 10, bold: true, color: C.dark, fontFace: 'Calibri',
        });
        s.addText(`Spend: ${fmt$(n.spend)}    ROAS: ${n.roas.toFixed(2)}x`, {
          x: bx + 0.3, y: by + 0.5, w: 3.5, h: 0.28,
          fontSize: 10, color: C.gray, fontFace: 'Calibri',
        });
        s.addText(`Orders: ${n.orders.toLocaleString()}    Impr: ${fmtK(n.impressions)}`, {
          x: bx + 0.3, y: by + 0.9, w: 3.5, h: 0.28,
          fontSize: 10, color: C.gray, fontFace: 'Calibri',
        });
      });
    }

    // ── Slide 5: Top Campaigns ────────────────────────────────────────────────
    {
      const s = pptx.addSlide();
      addHeader(pptx, s, 'Top Campaigns by ROAS', drLabel);

      const headerRow = ['Campaign', 'Network', 'ROAS', 'Spend', 'Revenue', 'Orders', 'NTB Rate'].map(t => ({
        text: t,
        options: { bold: true, color: C.white, fill: { color: C.indigo }, align: 'center' as const },
      }));
      const dataRows = campaigns.map((c, i) => [
        { text: `${i + 1}. ${c.campaign_name.length > 32 ? c.campaign_name.slice(0, 32) + '…' : c.campaign_name}` },
        { text: c.network.charAt(0).toUpperCase() + c.network.slice(1) },
        { text: `${c.roas.toFixed(2)}x`, options: { bold: true, color: C.indigo } },
        { text: fmt$(c.spend) },
        { text: fmt$(c.revenue) },
        { text: c.orders.toLocaleString() },
        { text: fmtPct(c.ntbRate) },
      ]);

      s.addTable([headerRow, ...dataRows], {
        x: 0.35, y: 0.7, w: 12.6,
        colW: [3.8, 1.6, 1.2, 1.6, 1.6, 1.2, 1.2],
        fontSize: 11,
        border: { type: 'solid', color: C.border, pt: 1 },
        fill: { color: C.white },
        rowH: 0.43,
        fontFace: 'Calibri',
      });
    }

    // ── Slide 6: Amazon Purchase Funnel (conditional) ─────────────────────────
    if (funnel) {
      const s = pptx.addSlide();
      addHeader(pptx, s, 'Amazon Purchase Funnel  ·  14-day attribution', drLabel);

      const stages = [
        { label: 'Impressions',      value: funnel.impressions,      prev: null,                   shade: '4F46E5' },
        { label: 'Detail Page Views', value: funnel.detailPageViews, prev: funnel.impressions,      shade: '6366F1' },
        { label: 'Add to Cart',       value: funnel.addToCart,       prev: funnel.detailPageViews,  shade: '818CF8' },
        { label: 'Orders',            value: funnel.orders,          prev: funnel.addToCart,        shade: 'A5B4FC' },
      ];

      const boxW = 2.8;
      const boxH = 2.2;
      const boxY = 2.2;
      const gapX = 0.55; // gap between boxes (for arrow)
      const totalWidth = stages.length * boxW + (stages.length - 1) * gapX;
      const startX = (13.33 - totalWidth) / 2;

      stages.forEach((stage, i) => {
        const x = startX + i * (boxW + gapX);
        const cvr = stage.prev && stage.prev > 0
          ? `${((stage.value / stage.prev) * 100).toFixed(1)}% CVR`
          : null;

        s.addShape(pptx.ShapeType.rect, {
          x, y: boxY, w: boxW, h: boxH,
          fill: { color: stage.shade },
          line: { color: stage.shade, width: 0 },
        });
        s.addText(stage.value.toLocaleString(), {
          x, y: boxY + 0.35, w: boxW, h: 0.8,
          fontSize: 26, bold: true, color: C.white, align: 'center', fontFace: 'Calibri',
        });
        s.addText(stage.label, {
          x, y: boxY + 1.25, w: boxW, h: 0.55,
          fontSize: 11, color: i < 2 ? C.indigoXl : C.dark, align: 'center', fontFace: 'Calibri', wrap: true,
        });

        // Arrow between boxes
        if (i < stages.length - 1) {
          s.addText('›', {
            x: x + boxW + 0.08, y: boxY + 0.7, w: 0.4, h: 0.8,
            fontSize: 28, color: C.lgray, align: 'center', fontFace: 'Calibri',
          });
        }

        // CVR % below box
        if (cvr) {
          s.addText(cvr, {
            x, y: boxY + boxH + 0.2, w: boxW, h: 0.35,
            fontSize: 11, bold: true, color: C.amber, align: 'center', fontFace: 'Calibri',
          });
        }
      });
    }

    // ── Return PPTX buffer ────────────────────────────────────────────────────
    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as unknown as Buffer;
    const filename = `meridian-report-${start}-${end}.pptx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[export/pptx]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate presentation' },
      { status: 500 }
    );
  }
}
