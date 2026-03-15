import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeRows, SUPPORTED_NETWORKS } from '@/lib/normalize';
import { insertMetrics, logUpload } from '@/lib/db';

type RawRow = Record<string, unknown>;

const EXT_CSV  = ['.csv'];
const EXT_XLSX = ['.xlsx', '.xls', '.xlsm', '.ods'];
const EXT_PDF  = ['.pdf'];

function getExt(name: string): string {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (result.errors.length > 0) {
    const fatal = result.errors.filter(e => e.type === 'Delimiter' || result.data.length === 0);
    if (fatal.length > 0) throw new Error(result.errors.map(e => e.message).join('; '));
  }
  return result.data;
}

// ── Excel parser ──────────────────────────────────────────────────────────────
function parseExcel(buffer: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel file contains no sheets');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, {
    defval: '',
    raw: false, // format all values as strings so our normalizer handles them
  });
  return rows;
}

// ── PDF parser ────────────────────────────────────────────────────────────────
async function parsePDF(buffer: Buffer): Promise<RawRow[]> {
  // Dynamic import so pdf-parse doesn't break SSR build
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdf-parse')) as any;
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buffer);
  const text: string = data.text;

  // Split into lines and try to detect a header row + data rows
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) throw new Error('Could not extract table data from PDF');

  // Detect delimiter: try tab first (most PDF table exports), then 2+ spaces
  const headerLine = lines[0];
  const hasTab = headerLine.includes('\t');
  const splitLine = (line: string): string[] =>
    hasTab
      ? line.split('\t').map(c => c.trim())
      : line.split(/\s{2,}/).map(c => c.trim());

  const headers = splitLine(headerLine).filter(h => h.length > 0);
  if (headers.length < 3) {
    throw new Error(
      'Could not detect column headers in PDF. For best results, export as CSV or Excel instead.'
    );
  }

  const rows: RawRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    if (cells.length < headers.length) continue; // skip short/summary lines
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

// ── Route handler ─────────────────────────────────────────────────────────────
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

    const ext = getExt(file.name);
    let rawRows: RawRow[];

    if (EXT_CSV.includes(ext)) {
      const text = await file.text();
      rawRows = parseCSV(text);
    } else if (EXT_XLSX.includes(ext)) {
      const buffer = await file.arrayBuffer();
      rawRows = parseExcel(buffer);
    } else if (EXT_PDF.includes(ext)) {
      const arrayBuf = await file.arrayBuffer();
      rawRows = await parsePDF(Buffer.from(arrayBuf));
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file type "${ext}". Accepted formats: CSV, Excel (.xlsx/.xls), PDF.`,
        },
        { status: 400 }
      );
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in the file.' },
        { status: 400 }
      );
    }

    const normalized = normalizeRows(network, rawRows);

    if (normalized.length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid rows could be mapped to the unified schema. ' +
            'Check that your column headers match the expected format for this network.',
        },
        { status: 400 }
      );
    }

    const inserted = insertMetrics(network, normalized);
    logUpload(file.name, network, inserted);

    return NextResponse.json({
      success: true,
      fileType: ext.replace('.', '').toUpperCase(),
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
