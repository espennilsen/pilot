/**
 * @file Grid overlay utility for desktop screenshots.
 *
 * Overlays a coordinate grid with axis labels on PNG screenshots to help
 * the AI agent reference precise pixel coordinates when clicking/dragging.
 */
import sharp from 'sharp';

export interface GridOptions {
  /** Grid line spacing in pixels. Default: 100 */
  gridSize?: number;
  /** Whether to show coordinate labels. Default: true */
  showLabels?: boolean;
  /** Grid line color (RGBA). Default: white at 40% opacity */
  lineColor?: string;
  /** Label text color. Default: white */
  labelColor?: string;
  /** Label background color. Default: semi-transparent black */
  labelBgColor?: string;
}

/**
 * Overlay a coordinate grid on a PNG screenshot.
 *
 * @param base64Png - Base64-encoded PNG image
 * @param options - Grid styling options
 * @returns Base64-encoded PNG with grid overlay
 */
export async function overlayGrid(base64Png: string, options: GridOptions = {}): Promise<string> {
  const {
    gridSize = 100,
    showLabels = true,
    lineColor = 'rgba(255, 255, 255, 0.4)',
    labelColor = '#fff',
    labelBgColor = 'rgba(0, 0, 0, 0.6)',
  } = options;

  if (gridSize <= 0) {
    throw new Error('gridSize must be > 0');
  }

  // Decode the base64 PNG to get image dimensions
  const pngBuffer = Buffer.from(base64Png, 'base64');
  const image = sharp(pngBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Failed to read image dimensions');
  }

  const { width, height } = metadata;

  // Generate SVG overlay with grid lines and labels
  const svg = generateGridSVG(width, height, gridSize, showLabels, lineColor, labelColor, labelBgColor);

  // Composite the SVG overlay onto the PNG
  const result = await image
    .composite([{
      input: Buffer.from(svg),
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer();

  return result.toString('base64');
}

/**
 * Generate an SVG string containing grid lines and coordinate labels.
 */
function generateGridSVG(
  width: number,
  height: number,
  gridSize: number,
  showLabels: boolean,
  lineColor: string,
  labelColor: string,
  labelBgColor: string,
): string {
  const lines: string[] = [];
  const labels: string[] = [];

  // Vertical grid lines and X-axis labels
  for (let x = 0; x <= width; x += gridSize) {
    // Skip x=0 to avoid overlapping with edge
    if (x > 0) {
      lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${lineColor}" stroke-width="1"/>`);
    }

    // Add X-axis label at the top
    if (showLabels && x > 0) {
      const labelX = x;
      const labelY = 12;
      labels.push(
        `<rect x="${labelX - 20}" y="${labelY - 10}" width="40" height="14" fill="${labelBgColor}" rx="2"/>`,
        `<text x="${labelX}" y="${labelY}" fill="${labelColor}" font-family="monospace" font-size="11" text-anchor="middle">${x}</text>`,
      );
    }
  }

  // Horizontal grid lines and Y-axis labels
  for (let y = 0; y <= height; y += gridSize) {
    // Skip y=0 to avoid overlapping with edge
    if (y > 0) {
      lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${lineColor}" stroke-width="1"/>`);
    }

    // Add Y-axis label on the left
    if (showLabels && y > 0) {
      const labelX = 24;
      const labelY = y + 4;
      labels.push(
        `<rect x="${labelX - 22}" y="${labelY - 10}" width="44" height="14" fill="${labelBgColor}" rx="2"/>`,
        `<text x="${labelX}" y="${labelY}" fill="${labelColor}" font-family="monospace" font-size="11" text-anchor="middle">${y}</text>`,
      );
    }
  }

  // Origin label (0,0) at top-left corner
  if (showLabels) {
    labels.push(
      `<rect x="2" y="2" width="32" height="14" fill="${labelBgColor}" rx="2"/>`,
      `<text x="18" y="12" fill="${labelColor}" font-family="monospace" font-size="11" text-anchor="middle">0,0</text>`,
    );
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${lines.join('\n  ')}
  ${labels.join('\n  ')}
</svg>`;
}
