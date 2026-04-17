import { Alert } from '@healthdash/shared';

function triggerDownload(filename: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function svgToCanvas(svg: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 600;
  const h = rect.height || 200;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Clone and set explicit dimensions so the browser renders at the right size
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise<HTMLCanvasElement>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.src = url;
  });
}

interface LegendItem {
  color: string;
  label: string;
}

/**
 * Reads the Recharts legend items from the DOM.
 * Recharts renders legends as HTML divs *outside* the SVG, so SVG serialisation
 * alone misses them. We read the color and label from each rendered legend item
 * and draw them on the canvas ourselves.
 */
function extractLegendItems(wrapper: HTMLElement): LegendItem[] {
  const items: LegendItem[] = [];
  wrapper.querySelectorAll<HTMLElement>('.recharts-legend-item').forEach((li) => {
    const textEl = li.querySelector<HTMLElement>('.recharts-legend-item-text');
    if (!textEl) return;
    const label = textEl.textContent?.trim() ?? '';
    // Recharts sets the color as an inline style on the text span
    const color = getComputedStyle(textEl).color || '#666666';
    if (label) items.push({ color, label });
  });
  return items;
}

/**
 * Draws a centered legend row (dot + label for each series) onto ctx.
 * Returns the height consumed so the caller can advance its y cursor.
 */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  items: LegendItem[],
  canvasWidth: number,
  y: number,
  scale: number,
): number {
  if (items.length === 0) return 0;

  const DOT_R = 4 * scale;
  const DOT_TEXT_GAP = 5 * scale;
  const ITEM_GAP = 18 * scale;
  const FONT_SIZE = 11 * scale;
  const ROW_H = 22 * scale;

  ctx.save();
  ctx.font = `${FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';

  // Measure total width so we can center the legend
  const itemWidths = items.map(
    (it) => DOT_R * 2 + DOT_TEXT_GAP + ctx.measureText(it.label).width,
  );
  const totalW = itemWidths.reduce((s, w) => s + w, 0) + ITEM_GAP * (items.length - 1);
  let x = (canvasWidth - totalW) / 2;
  const midY = y + ROW_H / 2;

  items.forEach((item, i) => {
    // Filled circle
    ctx.beginPath();
    ctx.arc(x + DOT_R, midY, DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();

    // Label
    ctx.fillStyle = '#6b7280'; // gray-500
    ctx.fillText(item.label, x + DOT_R * 2 + DOT_TEXT_GAP, midY);

    x += itemWidths[i] + ITEM_GAP;
  });

  ctx.restore();
  return ROW_H;
}

/**
 * Finds each Recharts chart wrapper inside containerEl, captures the chart SVG
 * at 2× resolution, reads legend items from the sibling HTML, draws everything
 * onto a combined canvas, and downloads the result as a PNG.
 *
 * Recharts renders legends as HTML divs outside the SVG element, so we cannot
 * rely purely on SVG serialisation — we extract and redraw them manually.
 */
export async function exportChartsAsPng(
  containerEl: HTMLElement,
  filename: string,
): Promise<void> {
  // Each recharts-wrapper contains exactly one main SVG + one legend div
  const wrappers = Array.from(
    containerEl.querySelectorAll<HTMLElement>('div.recharts-wrapper'),
  );
  if (wrappers.length === 0) return;

  const SCALE = 2;
  const PAD = 12 * SCALE;
  const GAP = 10 * SCALE;

  interface Capture {
    chartCanvas: HTMLCanvasElement;
    legendItems: LegendItem[];
  }

  const captures: Capture[] = await Promise.all(
    wrappers.map(async (wrapper) => {
      // :scope > svg picks only the direct-child chart SVG, not the tiny icon
      // SVGs that Recharts renders inside each legend <li>
      const mainSvg = wrapper.querySelector<SVGSVGElement>(':scope > svg.recharts-surface');
      const chartCanvas = mainSvg
        ? await svgToCanvas(mainSvg, SCALE)
        : (() => {
            const c = document.createElement('canvas');
            c.width = 600 * SCALE;
            c.height = 180 * SCALE;
            return c;
          })();
      const legendItems = extractLegendItems(wrapper);
      return { chartCanvas, legendItems };
    }),
  );

  // Reserve space: chart height + legend row (if any) + gap between charts
  const LEGEND_ROW_H = 22 * SCALE;
  const maxChartW = Math.max(...captures.map((c) => c.chartCanvas.width));
  const totalW = maxChartW + PAD * 2;
  const totalH =
    PAD * 2 +
    captures.reduce((sum, c, i) => {
      const legendH = c.legendItems.length > 0 ? LEGEND_ROW_H : 0;
      return sum + c.chartCanvas.height + legendH + (i < captures.length - 1 ? GAP : 0);
    }, 0);

  const out = document.createElement('canvas');
  out.width = totalW;
  out.height = totalH;

  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  let y = PAD;
  for (const { chartCanvas, legendItems } of captures) {
    ctx.drawImage(chartCanvas, PAD, y);
    y += chartCanvas.height;
    y += drawLegend(ctx, legendItems, totalW, y, SCALE);
    y += GAP;
  }

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(filename, url);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
}

/**
 * Converts an array of Alert objects to a UTF-8 CSV file and triggers a
 * browser download. The BOM prefix (U+FEFF) ensures Excel opens the file
 * with the correct encoding without a manual import step.
 */
export function exportAlertsAsCsv(alerts: Alert[], filename: string): void {
  const HEADERS = [
    'Severity',
    'Service',
    'Message',
    'Status',
    'Triggered At',
    'Acknowledged At',
    'Resolved At',
  ];

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const rows = alerts.map((a) =>
    [
      a.severity,
      escape(a.serviceName),
      escape(a.message),
      a.status,
      new Date(a.triggeredAt).toISOString(),
      a.acknowledgedAt ? new Date(a.acknowledgedAt).toISOString() : '',
      a.resolvedAt ? new Date(a.resolvedAt).toISOString() : '',
    ].join(','),
  );

  const csv = [HEADERS.join(','), ...rows].join('\r\n');
  // BOM ensures Excel opens UTF-8 CSVs correctly without a manual import step
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  triggerDownload(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
