import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PptxGenJS from 'pptxgenjs';
import type { PptRenderMap } from './ppt-template.service';

export type GeneratedPptFile = {
  fileName: string;
  absolutePath: string;
  relativePath: string;
};

@Injectable()
export class PptRenderService {
  private readonly logger = new Logger(PptRenderService.name);

  async generatePptFile(renderMap: PptRenderMap): Promise<GeneratedPptFile> {
    const pptx = new PptxGenJS();
    pptx.layout = renderMap.layout;
    pptx.author = 'DirectionAI';
    pptx.company = 'DirectionAI';
    pptx.subject = 'Auto-generated presentation';
    pptx.title = renderMap.filename;

    for (const slideMap of renderMap.slides) {
      const slide = pptx.addSlide();

      for (const op of slideMap.operations) {
        const kind = String(op.kind ?? '');

        if (kind === 'setBackground') {
          const color = this.toColor(op.color, renderMap.theme.backgroundColor);
          slide.background = { color };
          continue;
        }

        if (kind === 'addAccentBar') {
          slide.addShape(pptx.ShapeType.rect, {
            x: Number((op.box as any)?.x ?? 0),
            y: Number((op.box as any)?.y ?? 0),
            w: Number((op.box as any)?.w ?? 0.1),
            h: Number((op.box as any)?.h ?? 7.5),
            fill: { color: this.toColor(op.color, renderMap.theme.accentColor) },
            line: { color: this.toColor(op.color, renderMap.theme.accentColor), pt: 0 },
          });
          continue;
        }

        if (kind === 'addMetaChip') {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: Number((op.box as any)?.x ?? 11),
            y: Number((op.box as any)?.y ?? 0.2),
            w: Number((op.box as any)?.w ?? 1.2),
            h: Number((op.box as any)?.h ?? 0.35),
            fill: { color: this.toColor(op.color, renderMap.theme.secondaryColor), transparency: 82 },
            line: { color: this.toColor(op.color, renderMap.theme.secondaryColor), pt: 0 },
          });
          slide.addText(String(op.text ?? ''), {
            x: Number((op.box as any)?.x ?? 11) + 0.06,
            y: Number((op.box as any)?.y ?? 0.2) + 0.03,
            w: Number((op.box as any)?.w ?? 1.2) - 0.12,
            h: Number((op.box as any)?.h ?? 0.35) - 0.06,
            fontSize: 9,
            color: this.toColor(op.color, renderMap.theme.secondaryColor),
            align: 'center',
            bold: true,
          });
          continue;
        }

        if (kind === 'addBodyPanel') {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: Number((op.box as any)?.x ?? 0.8),
            y: Number((op.box as any)?.y ?? 1.8),
            w: Number((op.box as any)?.w ?? 6),
            h: Number((op.box as any)?.h ?? 4.4),
            fill: { color: this.toColor(op.color, renderMap.theme.backgroundColor), transparency: 2 },
            line: { color: this.toColor(op.border, renderMap.theme.secondaryColor), pt: 0.6, transparency: 55 },
          });
          continue;
        }

        if (kind === 'addText') {
          slide.addText(String(op.text ?? ''), {
            x: Number((op.box as any)?.x ?? 0.5),
            y: Number((op.box as any)?.y ?? 0.5),
            w: Number((op.box as any)?.w ?? 5),
            h: Number((op.box as any)?.h ?? 1),
            color: this.toColor(op.color, renderMap.theme.textColor),
            fontSize: Number(op.fontSize ?? 18),
            bold: Boolean(op.bold),
            valign: 'top',
            fit: 'shrink',
          });
          continue;
        }

        if (kind === 'addBullets') {
          const bullets = Array.isArray(op.bullets) ? op.bullets.map((item) => String(item)) : [];
          const text = bullets.map((bullet) => ({
            text: bullet,
            options: {
              bullet: { indent: 12 },
              breakLine: true,
            },
          }));
          slide.addText(text, {
            x: Number((op.box as any)?.x ?? 0.5),
            y: Number((op.box as any)?.y ?? 1.5),
            w: Number((op.box as any)?.w ?? 5),
            h: Number((op.box as any)?.h ?? 3),
            color: this.toColor(op.color, renderMap.theme.textColor),
            fontSize: Number(op.fontSize ?? 16),
            breakLine: true,
            valign: 'top',
            paraSpaceAfter: 10,
            margin: 3,
          });
          continue;
        }

        if (kind === 'addImage') {
          this.drawImageOrPlaceholder(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addChart') {
          this.drawChart(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addProcessFlow') {
          this.drawProcessFlow(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addTimeline') {
          this.drawTimeline(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addComparisonTable') {
          this.drawComparisonTable(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addStatsCards') {
          this.drawStatsCards(slide, pptx, renderMap, op);
          continue;
        }

        if (kind === 'addHighlight') {
          const text = String(op.text ?? '').trim();
          if (!text) continue;
          slide.addShape(pptx.ShapeType.roundRect, {
            x: Number((op.box as any)?.x ?? 0.8),
            y: Number((op.box as any)?.y ?? 6),
            w: Number((op.box as any)?.w ?? 11),
            h: Number((op.box as any)?.h ?? 0.7),
            fill: { color: this.toColor(op.color, renderMap.theme.accentColor), transparency: 12 },
            line: { color: this.toColor(op.color, renderMap.theme.accentColor), pt: 0.8 },
          });
          slide.addText(text, {
            x: Number((op.box as any)?.x ?? 0.8) + 0.15,
            y: Number((op.box as any)?.y ?? 6) + 0.08,
            w: Number((op.box as any)?.w ?? 11) - 0.3,
            h: Number((op.box as any)?.h ?? 0.7) - 0.16,
            color: this.toColor(renderMap.theme.backgroundColor, 'FFFFFF'),
            fontSize: 12,
            bold: true,
            valign: 'middle',
          });
        }
      }

      if (slideMap.speakerNotes?.trim()) {
        slide.addNotes(slideMap.speakerNotes);
      }
    }

    const outputDir = path.join(process.cwd(), 'generated', 'ppt');
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${renderMap.filename.replace(/\.pptx$/i, '')}-${timestamp}.pptx`;
    const absolutePath = path.join(outputDir, fileName);

    await pptx.writeFile({ fileName: absolutePath });

    const relativePath = path.relative(process.cwd(), absolutePath);
    this.logger.log(`PPT generated: ${relativePath}`);

    return { fileName, absolutePath, relativePath };
  }

  private drawImageOrPlaceholder(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const src = String(op.src ?? '').trim();
    const box = op.box as any;
    const x = Number(box?.x ?? 6);
    const y = Number(box?.y ?? 1.5);
    const w = Number(box?.w ?? 6);
    const h = Number(box?.h ?? 3.5);

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: this.toColor(renderMap.theme.backgroundColor, 'F3F4F6') },
      line: { color: this.toColor(renderMap.theme.secondaryColor, '9CA3AF'), pt: 0.8, transparency: 50 },
    });

    if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
      slide.addImage({ path: src, x: x + 0.05, y: y + 0.05, w: w - 0.1, h: h - 0.1 });
      return;
    }

    slide.addText(String(op.alt ?? 'Visual Placeholder'), {
      x: x + 0.3,
      y: y + 0.2,
      w: w - 0.6,
      h: h - 0.4,
      color: this.toColor(renderMap.theme.secondaryColor, '6B7280'),
      fontSize: 12,
      italic: true,
      valign: 'middle',
      align: 'center',
    });
  }

  private drawChart(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const chartType = String(op.chartType ?? 'bar');
    const categories = Array.isArray(op.categories) ? op.categories.map((c) => String(c)) : ['A', 'B', 'C'];
    const values = Array.isArray(op.values) ? op.values.map((v) => Number(v)) : [40, 60, 80];
    const box = op.box as any;
    const x = Number(box?.x ?? 6);
    const y = Number(box?.y ?? 1.8);
    const w = Number(box?.w ?? 5.5);
    const h = Number(box?.h ?? 4.2);

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: this.toColor(renderMap.theme.backgroundColor, 'FFFFFF') },
      line: { color: this.toColor(renderMap.theme.secondaryColor, 'D1D5DB'), pt: 0.6, transparency: 55 },
    });

    const title = String(op.title ?? '').trim();
    if (title) {
      slide.addText(title, {
        x: x + 0.2,
        y: y + 0.1,
        w: w - 0.4,
        h: 0.35,
        color: this.toColor(renderMap.theme.primaryColor, '111827'),
        fontSize: 12,
        bold: true,
      });
    }

    const chartSpace = { x: x + 0.2, y: y + 0.55, w: w - 0.4, h: h - 0.75 };
    const data = [{ name: 'Series 1', labels: categories, values }];

    const chartColors = [
      this.toColor(renderMap.theme.accentColor, '2563EB'),
      this.toColor(renderMap.theme.primaryColor, '1F2937'),
      this.toColor(renderMap.theme.secondaryColor, '4B5563'),
    ];

    if (chartType === 'line') {
      slide.addChart(pptx.ChartType.line, data, {
        ...chartSpace,
        catAxisLabelRotate: 0,
        showLegend: false,
        lineDataSymbol: 'circle',
        chartColors,
        valAxisMinVal: 0,
      });
      return;
    }

    if (chartType === 'pie') {
      slide.addChart(pptx.ChartType.pie, data, {
        ...chartSpace,
        showLegend: true,
        legendPos: 'b',
        chartColors,
        showPercent: true,
      });
      return;
    }

    slide.addChart(pptx.ChartType.bar, data, {
      ...chartSpace,
      barDir: 'col',
      showLegend: false,
      chartColors,
      valAxisMinVal: 0,
    });
  }

  private drawProcessFlow(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const steps = Array.isArray(op.steps) ? op.steps.map((s) => String(s)) : ['Step 1', 'Step 2', 'Step 3'];
    const box = op.box as any;
    const x = Number(box?.x ?? 6);
    const y = Number(box?.y ?? 1.8);
    const w = Number(box?.w ?? 5.5);
    const h = Number(box?.h ?? 4.2);

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: this.toColor(renderMap.theme.backgroundColor, 'FFFFFF') },
      line: { color: this.toColor(renderMap.theme.secondaryColor, 'D1D5DB'), pt: 0.6, transparency: 55 },
    });

    const count = Math.min(steps.length, 5);
    const cardW = (w - 0.7 - (count - 1) * 0.2) / count;
    const cardY = y + h / 2 - 0.45;

    for (let i = 0; i < count; i += 1) {
      const cx = x + 0.35 + i * (cardW + 0.2);
      slide.addShape(pptx.ShapeType.roundRect, {
        x: cx,
        y: cardY,
        w: cardW,
        h: 0.9,
        fill: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), transparency: 18 },
        line: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), pt: 0.6 },
      });
      slide.addText(steps[i], {
        x: cx + 0.08,
        y: cardY + 0.14,
        w: cardW - 0.16,
        h: 0.62,
        fontSize: 10,
        align: 'center',
        valign: 'middle',
        color: this.toColor(renderMap.theme.primaryColor, '111827'),
        bold: true,
      });

      if (i < count - 1) {
        slide.addShape(pptx.ShapeType.chevron, {
          x: cx + cardW + 0.02,
          y: cardY + 0.3,
          w: 0.14,
          h: 0.3,
          fill: { color: this.toColor(renderMap.theme.secondaryColor, '6B7280') },
          line: { color: this.toColor(renderMap.theme.secondaryColor, '6B7280'), pt: 0 },
        });
      }
    }
  }

  private drawTimeline(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const steps = Array.isArray(op.steps) ? op.steps.map((s) => String(s)) : ['Phase 1', 'Phase 2', 'Phase 3'];
    const box = op.box as any;
    const x = Number(box?.x ?? 1);
    const y = Number(box?.y ?? 3.5);
    const w = Number(box?.w ?? 10);
    const h = Number(box?.h ?? 2.5);

    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.4,
      y: y + h / 2,
      w: w - 0.8,
      h: 0,
      line: { color: this.toColor(renderMap.theme.secondaryColor, '6B7280'), pt: 1.5 },
    });

    const count = Math.min(steps.length, 6);
    for (let i = 0; i < count; i += 1) {
      const px = x + 0.5 + (i * (w - 1.0)) / Math.max(count - 1, 1);
      slide.addShape(pptx.ShapeType.ellipse, {
        x: px - 0.09,
        y: y + h / 2 - 0.09,
        w: 0.18,
        h: 0.18,
        fill: { color: this.toColor(renderMap.theme.accentColor, '2563EB') },
        line: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), pt: 0 },
      });
      slide.addText(steps[i], {
        x: px - 0.85,
        y: y + h / 2 + (i % 2 === 0 ? 0.22 : -0.78),
        w: 1.7,
        h: 0.5,
        fontSize: 9,
        align: 'center',
        color: this.toColor(renderMap.theme.primaryColor, '111827'),
      });
    }
  }

  private drawComparisonTable(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const rows = Array.isArray(op.rows) ? (op.rows as Array<{ metric: string; left: string; right: string }>) : [];
    const box = op.box as any;
    const x = Number(box?.x ?? 6);
    const y = Number(box?.y ?? 1.8);
    const w = Number(box?.w ?? 5.5);
    const h = Number(box?.h ?? 4.2);

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: this.toColor(renderMap.theme.backgroundColor, 'FFFFFF') },
      line: { color: this.toColor(renderMap.theme.secondaryColor, 'D1D5DB'), pt: 0.6, transparency: 55 },
    });

    const headerH = 0.45;
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.15,
      y: y + 0.15,
      w: w - 0.3,
      h: headerH,
      fill: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), transparency: 16 },
      line: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), pt: 0 },
    });

    const col1 = x + 0.25;
    const col2 = x + w * 0.48;
    const col3 = x + w * 0.73;
    slide.addText('Metric', { x: col1, y: y + 0.23, w: w * 0.22, h: 0.25, fontSize: 10, bold: true });
    slide.addText('Current', { x: col2, y: y + 0.23, w: w * 0.2, h: 0.25, fontSize: 10, bold: true });
    slide.addText('Target', { x: col3, y: y + 0.23, w: w * 0.2, h: 0.25, fontSize: 10, bold: true });

    const bodyRows = rows.length > 0 ? rows.slice(0, 5) : [
      { metric: 'Cycle Time', left: '12 days', right: '4 days' },
      { metric: 'Cost', left: '$38', right: '$22' },
      { metric: 'Error Rate', left: '8%', right: '2%' },
    ];

    const rowH = (h - 0.8) / bodyRows.length;
    bodyRows.forEach((row, idx) => {
      const ry = y + 0.65 + idx * rowH;
      if (idx % 2 === 0) {
        slide.addShape(pptx.ShapeType.rect, {
          x: x + 0.15,
          y: ry,
          w: w - 0.3,
          h: rowH,
          fill: { color: this.toColor(renderMap.theme.secondaryColor, 'F3F4F6'), transparency: 92 },
          line: { color: this.toColor(renderMap.theme.secondaryColor, 'F3F4F6'), pt: 0 },
        });
      }

      slide.addText(row.metric, { x: col1, y: ry + 0.08, w: w * 0.22, h: rowH - 0.12, fontSize: 10 });
      slide.addText(row.left, { x: col2, y: ry + 0.08, w: w * 0.2, h: rowH - 0.12, fontSize: 10 });
      slide.addText(row.right, {
        x: col3,
        y: ry + 0.08,
        w: w * 0.2,
        h: rowH - 0.12,
        fontSize: 10,
        bold: true,
        color: this.toColor(renderMap.theme.accentColor, '2563EB'),
      });
    });
  }

  private drawStatsCards(slide: any, pptx: any, renderMap: PptRenderMap, op: Record<string, unknown>): void {
    const cards = Array.isArray(op.cards) ? (op.cards as Array<{ label: string; value: string }>) : [];
    const box = op.box as any;
    const x = Number(box?.x ?? 6);
    const y = Number(box?.y ?? 1.8);
    const w = Number(box?.w ?? 5.5);
    const h = Number(box?.h ?? 4.2);

    const list = cards.length > 0 ? cards.slice(0, 4) : [
      { label: 'KPI 1', value: '45%' },
      { label: 'KPI 2', value: '68%' },
      { label: 'KPI 3', value: '$120K' },
      { label: 'KPI 4', value: '3.2x' },
    ];

    const cols = 2;
    const rows = Math.ceil(list.length / cols);
    const gap = 0.22;
    const cardW = (w - gap * (cols + 1)) / cols;
    const cardH = (h - gap * (rows + 1)) / rows;

    list.forEach((card, i) => {
      const cx = x + gap + (i % cols) * (cardW + gap);
      const cy = y + gap + Math.floor(i / cols) * (cardH + gap);

      slide.addShape(pptx.ShapeType.roundRect, {
        x: cx,
        y: cy,
        w: cardW,
        h: cardH,
        fill: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), transparency: 82 },
        line: { color: this.toColor(renderMap.theme.accentColor, '2563EB'), pt: 0.8, transparency: 30 },
      });

      slide.addText(card.value, {
        x: cx + 0.15,
        y: cy + 0.18,
        w: cardW - 0.3,
        h: cardH * 0.45,
        fontSize: 24,
        bold: true,
        color: this.toColor(renderMap.theme.primaryColor, '111827'),
      });

      slide.addText(card.label, {
        x: cx + 0.15,
        y: cy + cardH * 0.58,
        w: cardW - 0.3,
        h: cardH * 0.32,
        fontSize: 10,
        color: this.toColor(renderMap.theme.secondaryColor, '4B5563'),
      });
    });
  }

  private toColor(value: unknown, fallback: string): string {
    const raw = String(value ?? '').trim().replace('#', '').toUpperCase();
    return /^[0-9A-F]{6}$/.test(raw) ? raw : fallback.replace('#', '').toUpperCase();
  }
}
