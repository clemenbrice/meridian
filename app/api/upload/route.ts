import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { normalizeRows, SUPPORTED_NETWORKS } from '@/lib/normalize';
import { insertMetrics, logUpload } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const network = (formData.get('network') as string | null)?.toLowerCase();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!network || !SUPPORTED_NETWORKS.includes(network as typeof SUPPORTED_NETWORKS[number])) {
      return NextResponse.json(
        { error: `Network must be one of: ${SUPPORTED_NETWORKS.join(', ')}` },
        { status: 400 }
      );
    }

    const text = await file.text();

    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors.length > 0) {
      const msg = parsed.errors.map(e => e.message).join('; ');
      return NextResponse.json({ error: `CSV parse error: ${msg}` }, { status: 400 });
    }

    const normalized = normalizeRows(network, parsed.data);

    if (normalized.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Check that the file matches the expected format for this network.' },
        { status: 400 }
      );
    }

    const inserted = insertMetrics(network, normalized);
    logUpload(file.name, network, inserted);

    return NextResponse.json({
      success: true,
      rowsProcessed: normalized.length,
      rowsInserted: inserted,
      rowsSkipped: normalized.length - inserted,
    });
  } catch (err) {
    console.error('[upload]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
