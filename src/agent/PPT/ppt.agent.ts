import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import {
  FinalMapPPT,
  PptRenderMap,
  PptTemplateService,
  StructuredVisualData,
} from './Templates/ppt-template.service';

export type SlideBlueprint = {
  id: number;
  type: string;
  title: string;
  goal: string;
};

export type SlidePlan = {
  title: string;
  slides: SlideBlueprint[];
};

export type SlideContent = {
  heading: string;
  subheading?: string;
  highlight_text?: string;
  bullets: string[];
  visual: string;
  speaker_notes?: string;
  layoutType?: string;
};

export type CategorizedRequest = {
  topic: string;
  problem: string;
  audience: string;
  objective: string;
  tone: 'executive' | 'educational' | 'sales' | 'investor' | 'general';
  keyPoints: string[];
};

export type SlideContentMap = {
  slideId: number;
  type: string;
  title: string;
  goal: string;
  content: SlideContent;
};

export type SlideVisualDataMap = {
  slideId: number;
  visual: string;
  data: StructuredVisualData;
};

export type IllustrationAsset = {
  slideId: number;
  visualKey: string;
  imageUrl: string;
  alt: string;
  provider: 'unsplash-source';
};

export type ThemeSpec = {
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
};

export type FinalPptPayload = {
  title: string;
  categorizedRequest: CategorizedRequest;
  slidePlan: SlidePlan;
  theme: ThemeSpec;
  slides: Array<{
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
    illustration: IllustrationAsset;
    structuredData?: StructuredVisualData;
  }>;
  finalMapPPT: FinalMapPPT;
  pptRenderMap: PptRenderMap;
};

@Injectable()
export class PptAgentService {
  private readonly logger = new Logger(PptAgentService.name);

  private readonly Visual = [
    'bar_chart',
    'line_chart',
    'pie_chart',
    'timeline',
    'process_flow',
    'comparison_table',
    'stats_cards',
    'infographic',
    'architecture_diagram',
    'growth_curve',
  ];

  private readonly Layouts = [
    'hero',
    'two_column',
    'image_left_content_right',
    'stats',
    'comparison',
    'timeline',
    'bullet_list',
    'quote',
    'team_grid',
    'cta',
  ];

  constructor(
    private readonly aiService: AiService,
    private readonly pptTemplateService: PptTemplateService,
  ) {}

  async runPptAgentPipeline(
    requestText: string,
    inputPlan?: SlidePlan,
    onProgress?: (stage: string, message: string, progress: number) => void,
  ): Promise<FinalPptPayload> {
    onProgress?.('categorize', 'Understanding request and presentation intent', 10);
    const categorized = await this.categorizeAndUnderstandAgent(requestText);
    onProgress?.('planning', 'Planning slide architecture', 22);
    const slidePlan = await this.slidePlanningAgent(categorized, inputPlan);
    onProgress?.('content-map', 'Mapping content for each slide', 38);
    const mapped = await this.slideContentMapperAgent(slidePlan, categorized);
    onProgress?.('visual-data', 'Extracting chart and visual data', 52);
    const structuredVisualData = await this.visualDataExtractionAgent(
      mapped,
      categorized,
    );
    onProgress?.('illustrations', 'Preparing slide illustrations', 66);
    const illustrations = await this.illustrationEngineAgent(mapped);
    onProgress?.('theme', 'Generating presentation theme', 76);
    const theme = await this.themeEngineAgent(categorized, mapped);
    onProgress?.('assemble', 'Assembling final slide payload', 84);
    const assembled = this.finalAssemblerAgent(
      categorized,
      slidePlan,
      mapped,
      structuredVisualData,
      illustrations,
      theme,
    );
    onProgress?.('render-map', 'Building PPT render map', 90);
    const finalMapPPT = this.finalMapPptAgent(assembled);
    const pptRenderMap = this.pptMapperAgent(finalMapPPT);
    onProgress?.('done', 'PPT pipeline completed', 100);

    return {
      ...assembled,
      finalMapPPT,
      pptRenderMap,
    };
  }

  private async categorizeAndUnderstandAgent(
    requestText: string,
  ): Promise<CategorizedRequest> {
    const prompt = `You are agent-1 of a PPT architecture.
Task: Categorize and understand the user request.
Return ONLY valid JSON with this exact shape:
{
  "topic": "string",
  "problem": "string",
  "audience": "string",
  "objective": "string",
  "tone": "executive|educational|sales|investor|general",
  "keyPoints": ["string"]
}
User request:\n${requestText}`;

    try {
      const text = await this.askAi(prompt);
      const parsed = this.parseJson<CategorizedRequest>(text);
      if (!parsed || !parsed.topic || !Array.isArray(parsed.keyPoints)) {
        throw new Error('Invalid categorized JSON');
      }
      return parsed;
    } catch (error) {
      this.logger.warn(
        `categorizeAndUnderstandAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        topic: this.extractTopic(requestText),
        problem: this.extractProblem(requestText),
        audience: 'Business Stakeholders',
        objective: 'Present clear narrative and decision path',
        tone: 'general',
        keyPoints: this.extractKeyPoints(requestText),
      };
    }
  }

  private async slidePlanningAgent(
    categorized: CategorizedRequest,
    inputPlan?: SlidePlan,
  ): Promise<SlidePlan> {
    if (inputPlan?.slides?.length) {
      return inputPlan;
    }

    const prompt = `You are agent-2 of a PPT architecture.
Task: Decide slide count and slide structure.
Return ONLY valid JSON in this exact shape:
{
  "title": "string",
  "slides": [
    { "id": 1, "type": "hero", "title": "string", "goal": "string" }
  ]
}
Constraints:
- as many as no limit according request but typically above 10
- IDs must be sequential starting from 1
Context JSON:\n${JSON.stringify(categorized)}`;

    try {
      const text = await this.askAi(prompt);
      const parsed = this.parseJson<SlidePlan>(text);
      if (
        !parsed ||
        !parsed.title ||
        !Array.isArray(parsed.slides) ||
        parsed.slides.length === 0
      ) {
        throw new Error('Invalid slide plan JSON');
      }
      return parsed;
    } catch (error) {
      this.logger.warn(
        `slidePlanningAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        title: categorized.topic || 'Business Presentation',
        slides: [
          {
            id: 1,
            type: 'hero',
            title: categorized.topic || 'Overview',
            goal: 'Introduce vision',
          },
          {
            id: 2,
            type: 'problem',
            title: 'Current Problem',
            goal: 'Explain inefficiencies',
          },
          {
            id: 3,
            type: 'solution',
            title: 'Proposed Solution',
            goal: 'Show approach',
          },
          {
            id: 4,
            type: 'impact',
            title: 'Expected Impact',
            goal: 'Quantify benefits',
          },
          { id: 5, type: 'cta', title: 'Next Steps', goal: 'Drive decision' },
        ],
      };
    }
  }

  private async slideContentMapperAgent(
    plan: SlidePlan,
    categorized: CategorizedRequest,
  ): Promise<SlideContentMap[]> {
    const results: SlideContentMap[] = [];

    for (const slide of plan.slides) {
      const prompt = `You are agent-3 of a PPT architecture.
Task: Create slide content for one slide.
write proper content and bulkyness according to slide type and goal but keep it concise.
visual list : ${this.Visual.join(', ')}
Layout list : ${this.Layouts.join(', ')}
Return ONLY valid JSON in this exact shape:
{
  "heading": "string",
   "subheading": "string",
    "highlight_text": "string",
  "bullets": ["string", "string", "string"],
  "visual": "string",
  "speaker_notes": "string",
  "layoutType": "string"
}
Slide JSON:\n${JSON.stringify(slide)}
Context JSON:\n${JSON.stringify(categorized)}`;

      try {
        const text = await this.askAi(prompt);
        const content = this.parseJson<SlideContent>(text);
        if (
          !content ||
          !content.heading ||
          !Array.isArray(content.bullets) ||
          !content.visual
        ) {
          throw new Error('Invalid slide content JSON');
        }

        results.push({
          slideId: slide.id,
          type: slide.type,
          title: slide.title,
          goal: slide.goal,
          content,
        });
      } catch (error) {
        this.logger.warn(
          `slideContentMapperAgent fallback on slide ${slide.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        results.push({
          slideId: slide.id,
          type: slide.type,
          title: slide.title,
          goal: slide.goal,
          content: {
            heading: slide.title,
            subheading: slide.goal,
            highlight_text: categorized.objective,
            bullets: [
              slide.goal,
              categorized.problem,
              categorized.objective,
            ].filter(Boolean),
            visual: `${slide.type}_visual`,
            speaker_notes: `${slide.title}: ${slide.goal}`,
            layoutType: 'bullet_list',
          },
        });
      }
    }

    return results;
  }

  private async illustrationEngineAgent(
    mappedSlides: SlideContentMap[],
  ): Promise<IllustrationAsset[]> {
    const prompt = `You are agent-4 illustration engine.
Task: for each visual key, return a short query phrase for free stock image search.
Return ONLY valid JSON array in this shape:
[
  { "slideId": 1, "visualKey": "string", "query": "string", "alt": "string" }
]
Slides:\n${JSON.stringify(
      mappedSlides.map((s) => ({
        slideId: s.slideId,
        visual: s.content.visual,
        heading: s.content.heading,
      })),
    )}`;

    try {
      const text = await this.askAi(prompt);
      const queries = this.parseJson<
        Array<{
          slideId: number;
          visualKey: string;
          query: string;
          alt: string;
        }>
      >(text);
      if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Invalid illustration JSON');
      }

      return queries.map((item) => ({
        slideId: item.slideId,
        visualKey: item.visualKey,
        imageUrl: `https://source.unsplash.com/1280x720/?${encodeURIComponent(item.query)}`,
        alt: item.alt || `${item.visualKey} illustration`,
        provider: 'unsplash-source',
      }));
    } catch (error) {
      this.logger.warn(
        `illustrationEngineAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return mappedSlides.map((slide) => ({
        slideId: slide.slideId,
        visualKey: slide.content.visual,
        imageUrl: `https://source.unsplash.com/1280x720/?${encodeURIComponent(`${slide.content.visual} business presentation`)}`,
        alt: `${slide.content.visual} illustration`,
        provider: 'unsplash-source',
      }));
    }
  }

  private async visualDataExtractionAgent(
    mappedSlides: SlideContentMap[],
    categorized: CategorizedRequest,
  ): Promise<SlideVisualDataMap[]> {
    const prompt = `You are agent-4b visual data extraction engine.
Task: convert slide text into structured renderable visual data.
Return ONLY valid JSON array in this exact shape:
[
  {
    "slideId": 1,
    "visual": "bar_chart|line_chart|pie_chart|timeline|process_flow|comparison_table|stats_cards|infographic|architecture_diagram|growth_curve",
    "data": {
      "chartData": { "type": "bar|line|pie", "title": "string", "categories": ["string"], "values": [10,20] },
      "timelineData": { "steps": ["string"] },
      "processData": { "steps": ["string"] },
      "comparisonData": { "rows": [{ "metric": "string", "left": "string", "right": "string" }] },
      "statsData": { "cards": [{ "label": "string", "value": "string" }] }
    }
  }
]
Rules:
- Include only relevant data blocks for the visual type.
- Prefer concrete numbers from bullets where present.
- Keep arrays length 3-6 typically.
Slides:\n${JSON.stringify(
      mappedSlides.map((slide) => ({
        slideId: slide.slideId,
        visual: slide.content.visual,
        heading: slide.content.heading,
        bullets: slide.content.bullets,
      })),
    )}
Context:\n${JSON.stringify(categorized)}`;

    try {
      const text = await this.askAi(prompt);
      const parsed = this.parseJson<SlideVisualDataMap[]>(text);
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid visual structured data JSON');
      }

      return parsed
        .filter((item) => item && typeof item.slideId === 'number')
        .map((item) => ({
          slideId: item.slideId,
          visual: item.visual,
          data: item.data || {},
        }));
    } catch (error) {
      this.logger.warn(
        `visualDataExtractionAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    }
  }

  private async themeEngineAgent(
    categorized: CategorizedRequest,
    mappedSlides: SlideContentMap[],
  ): Promise<ThemeSpec> {
    const prompt = `You are agent-5 theme engine.
Task: produce a professional presentation color theme.
Return ONLY valid JSON in this exact shape:
{
  "backgroundColor": "#RRGGBB",
  "primaryColor": "#RRGGBB",
  "secondaryColor": "#RRGGBB",
  "textColor": "#RRGGBB",
  "accentColor": "#RRGGBB"
}
Context:\n${JSON.stringify({ categorized, slides: mappedSlides.map((s) => s.type) })}`;

    try {
      const text = await this.askAi(prompt);
      const theme = this.parseJson<ThemeSpec>(text);
      if (
        !theme ||
        !theme.backgroundColor ||
        !theme.primaryColor ||
        !theme.textColor
      ) {
        throw new Error('Invalid theme JSON');
      }
      return theme;
    } catch (error) {
      this.logger.warn(
        `themeEngineAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        backgroundColor: '#F9FAFB',
        primaryColor: '#1F2937',
        secondaryColor: '#4B5563',
        textColor: '#111827',
        accentColor: '#2563EB',
      };
    }
  }

  private finalAssemblerAgent(
    categorized: CategorizedRequest,
    plan: SlidePlan,
    mapped: SlideContentMap[],
    visualData: SlideVisualDataMap[],
    illustrations: IllustrationAsset[],
    theme: ThemeSpec,
  ): Omit<FinalPptPayload, 'finalMapPPT' | 'pptRenderMap' | 'generatedPpt'> {
    const illustrationBySlideId = new Map(
      illustrations.map((item) => [item.slideId, item]),
    );
    const visualDataBySlideId = new Map(
      visualData.map((item) => [item.slideId, item.data]),
    );

    return {
      title: plan.title,
      categorizedRequest: categorized,
      slidePlan: plan,
      theme,
      slides: mapped.map((slide) => ({
        id: slide.slideId,
        type: slide.type,
        title: slide.title,
        goal: slide.goal,
        heading: slide.content.heading,
        subheading: slide.content.subheading,
        bullets: slide.content.bullets,
        highlightText: slide.content.highlight_text,
        speakerNotes: slide.content.speaker_notes,
        layoutType: slide.content.layoutType,
        visual: slide.content.visual,
        structuredData: visualDataBySlideId.get(slide.slideId),
        illustration: illustrationBySlideId.get(slide.slideId) ?? {
          slideId: slide.slideId,
          visualKey: slide.content.visual,
          imageUrl: `https://source.unsplash.com/1280x720/?${encodeURIComponent(slide.content.visual)}`,
          alt: `${slide.content.visual} illustration`,
          provider: 'unsplash-source',
        },
      })),
    };
  }

  private finalMapPptAgent(
    finalPayload: Omit<FinalPptPayload, 'finalMapPPT' | 'pptRenderMap'>,
  ): FinalMapPPT {
    return this.pptTemplateService.buildFinalMapPPT(
      finalPayload.title,
      finalPayload.slides,
      finalPayload.theme,
    );
  }

  private pptMapperAgent(finalMapPPT: FinalMapPPT): PptRenderMap {
    return this.pptTemplateService.buildPptRenderMap(finalMapPPT);
  }

  private async askAi(prompt: string): Promise<string> {
    const model =
      process.env.PPT_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'anthropic.claude-3-5-sonnet-20240620-v1:0';
    const result = await this.aiService.generateWithBedrock(prompt, model, {
      inferenceConfig: {
        temperature: 0.2,
        maxTokens: 4000,
      },
    });
    return result.text;
  }

  private parseJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const cleaned = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(cleaned.slice(start, end + 1)) as T;
          } catch {
            return null;
          }
        }

        const arrStart = cleaned.indexOf('[');
        const arrEnd = cleaned.lastIndexOf(']');
        if (arrStart >= 0 && arrEnd > arrStart) {
          try {
            return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as T;
          } catch {
            return null;
          }
        }

        return null;
      }
    }
  }

  private extractTopic(text: string): string {
    if (!text) return 'Business Presentation';
    const firstLine = text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine ?? 'Business Presentation';
  }

  private extractProblem(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('procurement')) {
      return 'Procurement teams spend high effort on manual and fragmented workflows';
    }
    if (lower.includes('approval')) {
      return 'Approval cycles are slow and difficult to track';
    }
    return 'Teams face inefficiency, delays, and decision fragmentation';
  }

  private extractKeyPoints(text: string): string[] {
    return text
      .split(/[.\n]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 6);
  }
}
