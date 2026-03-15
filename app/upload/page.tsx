'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, FileSpreadsheet, FileType, X } from 'lucide-react';

type Network = 'amazon' | 'walmart' | 'criteo';

interface UploadResult {
  success: boolean;
  fileType?: string;
  rowsProcessed?: number;
  rowsInserted?: number;
  rowsSkipped?: number;
  error?: string;
}

const NETWORK_COLORS: Record<Network, string> = {
  amazon: 'border-orange-300 bg-orange-50 text-orange-700',
  walmart: 'border-blue-300 bg-blue-50 text-blue-700',
  criteo: 'border-green-300 bg-green-50 text-green-700',
};

const ACCEPTED = '.csv,.xlsx,.xls,.xlsm,.ods,.pdf';
const ACCEPTED_EXTS = new Set(['csv', 'xlsx', 'xls', 'xlsm', 'ods', 'pdf']);

function fileExt(name: string) {
  return name.slice(name.lastIndexOf('.') + 1).toLowerCase();
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = fileExt(name);
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext))
    return <FileSpreadsheet className={className} />;
  if (ext === 'pdf') return <FileType className={className} />;
  return <FileText className={className} />;
}

function fileBadgeColor(name: string) {
  const ext = fileExt(name);
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) return 'bg-emerald-100 text-emerald-700';
  if (ext === 'pdf') return 'bg-red-100 text-red-700';
  return 'bg-indigo-100 text-indigo-700';
}

export default function UploadPage() {
  const [network, setNetwork] = useState<Network>('amazon');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    const ext = fileExt(f.name);
    if (!ACCEPTED_EXTS.has(ext)) {
      setResult({
        success: false,
        error: `"${f.name}" is not supported. Please upload a CSV, Excel (.xlsx / .xls), or PDF file.`,
      });
      return;
    }
    setFile(f);
    setResult(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function doUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('network', network);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data: UploadResult = await res.json();
      setResult(data);
      if (data.success) setFile(null);
    } catch {
      setResult({ success: false, error: 'Network error. Please try again.' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Campaign Data</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import exports from Amazon DSP, Walmart Connect, or Criteo.
          Supported formats: CSV, Excel, PDF. Duplicate rows are automatically skipped.
        </p>
      </div>

      {/* Accepted format badges */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-gray-400 font-medium">Accepted:</span>
        {[
          { label: 'CSV', color: 'bg-indigo-100 text-indigo-700' },
          { label: 'XLSX', color: 'bg-emerald-100 text-emerald-700' },
          { label: 'XLS', color: 'bg-emerald-100 text-emerald-700' },
          { label: 'PDF', color: 'bg-red-100 text-red-700' },
        ].map(b => (
          <span key={b.label} className={`text-xs font-semibold px-2 py-0.5 rounded ${b.color}`}>
            {b.label}
          </span>
        ))}
      </div>

      {/* Network selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Network</label>
        <div className="grid grid-cols-3 gap-3">
          {(['amazon', 'walmart', 'criteo'] as Network[]).map(n => (
            <button
              key={n}
              onClick={() => setNetwork(n)}
              className={`py-3 px-4 rounded-lg border-2 text-sm font-medium capitalize transition-all ${
                network === n
                  ? NETWORK_COLORS[n] + ' border-current'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {n === 'amazon' ? 'Amazon DSP' : n === 'walmart' ? 'Walmart Connect' : 'Criteo'}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : file
            ? 'border-indigo-300 bg-indigo-50/50'
            : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileIcon name={file.name} className="w-6 h-6 text-indigo-500" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${fileBadgeColor(file.name)}`}>
              {fileExt(file.name)}
            </span>
            <button
              onClick={e => { e.stopPropagation(); setFile(null); setResult(null); }}
              className="text-gray-400 hover:text-gray-600 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Drop your file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">CSV · Excel (.xlsx, .xls) · PDF</p>
          </>
        )}
      </div>

      {/* Upload button */}
      <button
        onClick={doUpload}
        disabled={!file || uploading}
        className="mt-4 w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Processing…' : 'Upload & Ingest'}
      </button>

      {/* Result */}
      {result && (
        <div className={`mt-4 p-4 rounded-xl flex gap-3 ${
          result.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
        }`}>
          {result.success ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          )}
          <div>
            {result.success ? (
              <>
                <p className="text-sm font-semibold text-emerald-800">
                  Upload successful!{result.fileType ? ` (${result.fileType})` : ''}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {result.rowsInserted} rows inserted, {result.rowsSkipped} skipped as duplicates
                  (out of {result.rowsProcessed} total rows processed)
                </p>
              </>
            ) : (
              <p className="text-sm text-red-700">{result.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Format reference */}
      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Expected column formats</h2>
        <p className="text-xs text-gray-400">
          These column names are auto-detected regardless of whether you upload CSV, Excel, or PDF.
        </p>
        {[
          {
            label: 'Amazon DSP',
            cols: 'Date, Campaign Name, Campaign ID, Total Spend ($), Impressions, Clicks, Attributed Sales (14d), Attributed Orders (14d), New-to-Brand Orders, New-to-Brand Sales, Detail Page Views, Add to Cart, Campaign Type, Placement',
          },
          {
            label: 'Walmart Connect',
            cols: 'report_date, campaign, campaign_id, spend, total_impressions, total_clicks, attributed_revenue_14d, attributed_units_14d, new_buyer_orders, new_buyer_revenue, Ad Type, Placement',
          },
          {
            label: 'Criteo',
            cols: 'Day, CampaignName, CampaignId, Cost, Displays, Clicks, Revenue, Orders, NewCustomerOrders, NewCustomerRevenue, Creative Format, Placement Type',
          },
        ].map(({ label, cols }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
            <p className="text-xs text-gray-500 font-mono leading-relaxed">{cols}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
