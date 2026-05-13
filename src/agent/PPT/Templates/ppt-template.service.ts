import { Injectable } from '@nestjs/common';
import type { ThemeSpec } from '../ppt.agent';

export type VisualTemplate = {
  key: string;
  title: string;
  style: 'data' | 'diagram' | 'image' | 'highlight';
  fallbackQuery: string;
};

export type LayoutTemplate = {
  key: string;
  titleBox: { x: number; y: number; w: number; h: number };
  contentBox: { x: number; y: number; w: number; h: number };
  visualBox: { x: number; y: number; w: number; h: number };
  notesBox: { x: number; y: number; w: number; h: number };
};

export type SlideTemplateMapInput = {
  id: number;
  type: string;
  title: string;
  goal: string;
  heading: string;
  subheading?: string;
  bullets: string[];
  highlightText?: string;
  speakerNotes?: string;
  layoutType?: string;
  visual: string;
  illustration: {
    imageUrl: string;
    alt: string;
  };
  structuredData?: StructuredVisualData;
};

export type StructuredVisualData = {
  chartData?: {
    type?: 'bar' | 'line' | 'pie';
    title?: string;
    categories: string[];
    values: number[];
  };
  timelineData?: {
    steps: string[];
  };
  processData?: {
    steps: string[];
  };
  comparisonData?: {
    rows: Array<{ metric: string; left: string; right: string }>;
  };
  statsData?: {
    cards: Array<{ label: string; value: string }>;
  };
};

export type FinalMapPPTSlide = {
  slideId: number;
  slideType: string;
  layout: LayoutTemplate;
  visual: VisualTemplate;
  data: {
    heading: string;
    subheading?: string;
    bullets: string[];
    highlightText?: string;
    goal: string;
  };
  assets: {
    imageUrl: string;
    alt: string;
  };
  structuredData?: StructuredVisualData;
  notes?: string;
};

export type FinalMapPPT = {
  title: string;
  theme: ThemeSpec;
  slides: FinalMapPPTSlide[];
};

export type PptRenderOp = Record<string, unknown>;

export type PptRenderMap = {
  filename: string;
  layout: 'LAYOUT_WIDE';
  theme: ThemeSpec;
  slides: Array<{
    slideId: number;
    operations: PptRenderOp[];
    speakerNotes?: string;
  }>;
};

@Injectable()
export class PptTemplateService {
  private readonly visualTemplates: VisualTemplate[] = [
    { key: 'bar_chart', title: 'Bar Chart', style: 'data', fallbackQuery: 'business bar chart' },
    { key: 'line_chart', title: 'Line Chart', style: 'data', fallbackQuery: 'business line chart' },
    { key: 'pie_chart', title: 'Pie Chart', style: 'data', fallbackQuery: 'market share pie chart' },
    { key: 'timeline', title: 'Timeline', style: 'diagram', fallbackQuery: 'project roadmap timeline' },
    { key: 'process_flow', title: 'Process Flow', style: 'diagram', fallbackQuery: 'workflow process diagram' },
    { key: 'comparison_table', title: 'Comparison Table', style: 'data', fallbackQuery: 'comparison matrix' },
    { key: 'stats_cards', title: 'Stats Cards', style: 'highlight', fallbackQuery: 'kpi dashboard' },
    { key: 'infographic', title: 'Infographic', style: 'diagram', fallbackQuery: 'business infographic' },
    { key: 'architecture_diagram', title: 'Architecture Diagram', style: 'diagram', fallbackQuery: 'system architecture' },
    { key: 'growth_curve', title: 'Growth Curve', style: 'data', fallbackQuery: 'growth trend graph' },
  ];

  private readonly layoutTemplates: LayoutTemplate[] = [
    {
      key: 'hero',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.9, w: 5.9, h: 4.35 },
      visualBox: { x: 6.95, y: 1.75, w: 5.65, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'two_column',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.9, w: 5.9, h: 4.35 },
      visualBox: { x: 6.95, y: 1.75, w: 5.65, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'image_left_content_right',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 6.95, y: 1.9, w: 5.65, h: 4.35 },
      visualBox: { x: 0.8, y: 1.75, w: 5.9, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'stats',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.85, w: 6.0, h: 4.45 },
      visualBox: { x: 6.95, y: 1.75, w: 5.65, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'comparison',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.85, w: 6.0, h: 4.45 },
      visualBox: { x: 6.95, y: 1.75, w: 5.65, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'timeline',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.75, w: 11.8, h: 1.6 },
      visualBox: { x: 0.8, y: 3.45, w: 11.8, h: 2.85 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'bullet_list',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.9, w: 7.15, h: 4.35 },
      visualBox: { x: 8.15, y: 1.75, w: 4.45, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'quote',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 1.1, y: 2.1, w: 10.9, h: 2.6 },
      visualBox: { x: 1.1, y: 4.95, w: 10.9, h: 1.35 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'team_grid',
      titleBox: { x: 0.7, y: 0.45, w: 12.0, h: 1.1 },
      contentBox: { x: 0.8, y: 1.9, w: 5.9, h: 4.35 },
      visualBox: { x: 6.95, y: 1.75, w: 5.65, h: 4.55 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
    {
      key: 'cta',
      titleBox: { x: 0.7, y: 0.65, w: 12.0, h: 1.1 },
      contentBox: { x: 1.2, y: 2.15, w: 7.4, h: 3.9 },
      visualBox: { x: 8.85, y: 2.05, w: 3.75, h: 4.05 },
      notesBox: { x: 0.8, y: 6.5, w: 11.8, h: 0.55 },
    },
  ];

  buildFinalMapPPT(
    title: string,
    slides: SlideTemplateMapInput[],
    theme: ThemeSpec,
  ): FinalMapPPT {
    return {
      title,
      theme,
      slides: slides.map((slide) => ({
        slideId: slide.id,
        slideType: slide.type,
        layout: this.pickLayout(slide.layoutType),
        visual: this.pickVisual(slide.visual),
        data: {
          heading: slide.heading,
          subheading: slide.subheading,
          bullets: slide.bullets,
          highlightText: slide.highlightText,
          goal: slide.goal,
        },
        assets: {
          imageUrl: slide.illustration.imageUrl,
          alt: slide.illustration.alt,
        },
        structuredData: slide.structuredData,
        notes: slide.speakerNotes,
      })),
    };
  }

  buildPptRenderMap(finalMap: FinalMapPPT): PptRenderMap {
    return {
      filename: `${this.safeFileName(finalMap.title)}.pptx`,
      layout: 'LAYOUT_WIDE',
      theme: finalMap.theme,
      slides: finalMap.slides.map((slide, index) => {
        const visualOps = this.createVisualOperations(slide);
        return {
          slideId: slide.slideId,
          speakerNotes: slide.notes,
          operations: [
            { kind: 'setBackground', color: finalMap.theme.backgroundColor },
            {
              kind: 'addAccentBar',
              box: { x: 0.0, y: 0.0, w: 0.18, h: 7.5 },
              color: finalMap.theme.accentColor,
            },
            {
              kind: 'addMetaChip',
              text: `Slide ${index + 1}`,
              box: { x: 11.55, y: 0.3, w: 1.05, h: 0.3 },
              color: finalMap.theme.secondaryColor,
            },
            {
              kind: 'addText',
              text: slide.data.heading,
              box: slide.layout.titleBox,
              color: finalMap.theme.primaryColor,
              fontSize: 31,
              bold: true,
            },
            {
              kind: 'addText',
              text: slide.data.subheading ?? slide.data.goal,
              box: {
                x: slide.layout.titleBox.x,
                y: slide.layout.titleBox.y + 0.68,
                w: slide.layout.titleBox.w,
                h: 0.55,
              },
              color: finalMap.theme.secondaryColor,
              fontSize: 14,
            },
            {
              kind: 'addBodyPanel',
              box: slide.layout.contentBox,
              color: finalMap.theme.backgroundColor,
              border: finalMap.theme.secondaryColor,
            },
            {
              kind: 'addBullets',
              bullets: slide.data.bullets,
              box: {
                x: slide.layout.contentBox.x + 0.25,
                y: slide.layout.contentBox.y + 0.25,
                w: slide.layout.contentBox.w - 0.5,
                h: slide.layout.contentBox.h - 0.5,
              },
              color: finalMap.theme.textColor,
              accentColor: finalMap.theme.accentColor,
              fontSize: 16,
            },
            ...visualOps,
            {
              kind: 'addHighlight',
              text: slide.data.highlightText ?? '',
              box: slide.layout.notesBox,
              color: finalMap.theme.accentColor,
            },
          ],
        };
      }),
    };
  }

  private createVisualOperations(slide: FinalMapPPTSlide): PptRenderOp[] {
    const bullets = slide.data.bullets;
    const structured = slide.structuredData;

    if (slide.visual.key === 'bar_chart') {
      return [
        {
          kind: 'addChart',
          chartType: 'bar',
          box: slide.layout.visualBox,
          categories:
            structured?.chartData?.categories?.length
              ? structured.chartData.categories
              : this.labelsFromBullets(bullets),
          values:
            structured?.chartData?.values?.length
              ? structured.chartData.values
              : this.numericSeriesFromBullets(bullets, [72, 56, 88, 64]),
          title: structured?.chartData?.title || 'Category Performance',
        },
      ];
    }

    if (slide.visual.key === 'line_chart' || slide.visual.key === 'growth_curve') {
      return [
        {
          kind: 'addChart',
          chartType: structured?.chartData?.type || 'line',
          box: slide.layout.visualBox,
          categories:
            structured?.chartData?.categories?.length
              ? structured.chartData.categories
              : ['Q1', 'Q2', 'Q3', 'Q4'],
          values:
            structured?.chartData?.values?.length
              ? structured.chartData.values
              : this.numericSeriesFromBullets(bullets, [20, 35, 52, 68]),
          title: structured?.chartData?.title || 'Growth Trend',
        },
      ];
    }

    if (slide.visual.key === 'pie_chart') {
      return [
        {
          kind: 'addChart',
          chartType: structured?.chartData?.type || 'pie',
          box: slide.layout.visualBox,
          categories:
            structured?.chartData?.categories?.length
              ? structured.chartData.categories
              : this.labelsFromBullets(bullets),
          values:
            structured?.chartData?.values?.length
              ? structured.chartData.values
              : this.numericSeriesFromBullets(bullets, [45, 30, 25]),
          title: structured?.chartData?.title || 'Distribution Split',
        },
      ];
    }

    if (slide.visual.key === 'comparison_table') {
      return [
        {
          kind: 'addComparisonTable',
          box: slide.layout.visualBox,
          rows:
            structured?.comparisonData?.rows?.length
              ? structured.comparisonData.rows
              : this.comparisonRowsFromBullets(bullets),
        },
      ];
    }

    if (slide.visual.key === 'timeline') {
      return [
        {
          kind: 'addTimeline',
          box: slide.layout.visualBox,
          steps:
            structured?.timelineData?.steps?.length
              ? structured.timelineData.steps
              : this.timelineStepsFromBullets(bullets),
        },
      ];
    }

    if (slide.visual.key === 'process_flow' || slide.visual.key === 'architecture_diagram') {
      return [
        {
          kind: 'addProcessFlow',
          box: slide.layout.visualBox,
          steps:
            structured?.processData?.steps?.length
              ? structured.processData.steps
              : this.timelineStepsFromBullets(bullets),
        },
      ];
    }

    if (slide.visual.key === 'stats_cards') {
      return [
        {
          kind: 'addStatsCards',
          box: slide.layout.visualBox,
          cards:
            structured?.statsData?.cards?.length
              ? structured.statsData.cards
              : this.statsCardsFromBullets(bullets),
        },
      ];
    }

    return [
      {
        kind: 'addImage',
        src: slide.assets.imageUrl,
        alt: slide.assets.alt,
        box: slide.layout.visualBox,
        style: slide.visual.style,
      },
    ];
  }

  private labelsFromBullets(bullets: string[]): string[] {
    const labels = bullets
      .slice(0, 5)
      .map((line, i) => {
        const cleaned = line.replace(/\d+[%$]?/g, '').trim();
        return cleaned.length > 0 ? cleaned.slice(0, 18) : `Item ${i + 1}`;
      });
    return labels.length > 0 ? labels : ['Item 1', 'Item 2', 'Item 3'];
  }

  private numericSeriesFromBullets(bullets: string[], fallback: number[]): number[] {
    const extracted = bullets
      .map((line) => {
        const match = line.match(/(-?\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : null;
      })
      .filter((value): value is number => value !== null)
      .slice(0, 6);

    if (extracted.length >= 2) {
      return extracted;
    }
    return fallback;
  }

  private comparisonRowsFromBullets(bullets: string[]): Array<{ metric: string; left: string; right: string }> {
    const rows = bullets.slice(0, 4).map((line, i) => {
      const parts = line.split(/:|vs|\|/i).map((item) => item.trim()).filter(Boolean);
      return {
        metric: parts[0] || `Metric ${i + 1}`,
        left: parts[1] || 'Current',
        right: parts[2] || 'Target',
      };
    });

    return rows.length > 0
      ? rows
      : [
          { metric: 'Cycle Time', left: '12 Days', right: '4 Days' },
          { metric: 'Error Rate', left: '8%', right: '2%' },
          { metric: 'Cost / Task', left: '$38', right: '$22' },
        ];
  }

  private timelineStepsFromBullets(bullets: string[]): string[] {
    const steps = bullets
      .slice(0, 5)
      .map((line) => line.replace(/^[-*\d).\s]+/, '').trim())
      .filter(Boolean);
    return steps.length > 0 ? steps : ['Discover', 'Design', 'Build', 'Launch'];
  }

  private statsCardsFromBullets(bullets: string[]): Array<{ label: string; value: string }> {
    const cards = bullets.slice(0, 4).map((line, i) => {
      const valueMatch = line.match(/(\$?\d+(?:\.\d+)?%?)/);
      const value = valueMatch?.[1] ?? `${(i + 1) * 25}%`;
      const label = line.replace(valueMatch?.[1] ?? '', '').replace(/[:\-]/g, '').trim() || `KPI ${i + 1}`;
      return { label: label.slice(0, 22), value };
    });

    return cards.length > 0
      ? cards
      : [
          { label: 'Cost Saved', value: '$120K' },
          { label: 'Delivery Speed', value: '+42%' },
          { label: 'Automation', value: '68%' },
          { label: 'NPS', value: '74' },
        ];
  }

  private pickVisual(value: string): VisualTemplate {
    const normalized = value?.trim().toLowerCase();
    return (
      this.visualTemplates.find((visual) => visual.key === normalized) ?? {
        key: normalized || 'infographic',
        title: 'Auto Visual',
        style: 'image',
        fallbackQuery: normalized || 'business visual',
      }
    );
  }

  private pickLayout(value?: string): LayoutTemplate {
    const normalized = value?.trim().toLowerCase();
    return (
      this.layoutTemplates.find((layout) => layout.key === normalized) ??
      this.layoutTemplates.find((layout) => layout.key === 'two_column')!
    );
  }

  private safeFileName(input: string): string {
    const cleaned = (input || 'presentation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || 'presentation';
  }
}
