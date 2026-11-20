import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { apiExploreView } from '@/lib/api';
import { getBrand } from '@/lib/brand-server';

/**
 * The current explorer view as an .xlsx (specs/018 R17): one sheet per
 * series, full-precision figures as numbers with a peso format. Public and
 * anonymous — it reads the same `/public/explorer/view` the page does, so
 * the API's own throttle applies. Lives under `/api/` (client-owned; nginx
 * only routes `/api/v1/*` to NestJS).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let view;
  try {
    view = await apiExploreView(params);
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "People's Budget Portal";
  for (const s of view.series) {
    const ws = wb.addWorksheet(s.label.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    ws.columns = [
      { header: view.view.groupBy, key: 'label', width: 48 },
      { header: s.measure === 'money' ? s.moneyWord : `Number of ${s.countWord}`, key: 'value', width: 22 },
      { header: 'Share', key: 'share', width: 10 },
    ];
    for (const r of s.rows) ws.addRow({ label: r.sublabel ? `${r.label} (${r.sublabel})` : r.label, value: Number(r.value), share: r.share });
    if (s.other) ws.addRow({ label: `Other (${s.other.n})`, value: Number(s.other.value) });
    if (s.total !== null) ws.addRow({ label: 'Total', value: Number(s.total) }).font = { bold: true };
    ws.getColumn('value').numFmt = s.measure === 'money' ? '"₱"#,##0.00' : '#,##0';
    ws.getColumn('share').numFmt = '0.0%';
    ws.addRow([]);
    for (const note of view.notes) ws.addRow([note]);
  }
  const body = await wb.xlsx.writeBuffer();
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${(await getBrand()).slug}-budget-explorer.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
