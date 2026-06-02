import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import type { AgentUsageContext } from '../types/agent-usage-context.type';
import type { DirectionAiMemory } from '../types/directionai-memory.type';
import { ImageKitService } from './imagekit.service';

export { ImageKitService, type ImageKitGenerateOptions, type ImageKitGeneratedImage } from './imagekit.service';

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

export type StructuredVisualData = {
  chartData?: {
    type?: string;
    title?: string;
    categories?: string[];
    values?: number[];
  };
  timelineData?: { steps?: string[] };
  processData?: { steps?: string[] };
  comparisonData?: {
    rows?: Array<{ metric?: string; left?: string; right?: string }>;
  };
  statsData?: {
    cards?: Array<{ label?: string; value?: string }>;
  };
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
  provider: 'unsplash-source' | 'imagekit';
};

export type ThemeSpec = {
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
};

export type PptSlidePayload = {
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
  structuredData?: StructuredVisualData;
  illustration: IllustrationAsset;
};

export type FinalPptPayload = {
  version: 'v2';
  title: string;
  categorizedRequest: CategorizedRequest;
  slidePlan: SlidePlan;
  theme: ThemeSpec;
  summary: {
    totalSlides: number;
    objective: string;
    audience: string;
    keyPoints: string[];
    slideTypes: Record<string, number>;
  };
  slides: PptSlidePayload[];
};

@Injectable()
export class PptAgentService {
  private readonly logger = new Logger(PptAgentService.name);

  private readonly visuals = [
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

  private readonly layouts = [
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
    private readonly imageKitService: ImageKitService,
  ) {}

  async runPptAgentPipeline(
    requestText: string,
    inputPlan?: SlidePlan,
    onProgress?: (stage: string, message: string, progress: number) => void,
    usageContext?: AgentUsageContext,
    imageProvider: 'unsplash-source' | 'imagekit' = 'imagekit',
    memory?: DirectionAiMemory | null,
  ): Promise<FinalPptPayload> {
    this.logger.log(`[PPT Pipeline] Starting with image provider: ${imageProvider}`);
    this.logger.log(`[PPT Pipeline] ImageKit configured: ${this.imageKitService.isConfigured()}`);
    
    const contextText = this.buildContextText(requestText, memory);
    onProgress?.('categorize', 'Understanding request and presentation intent', 10);
    const categorized = await this.categorizeAndUnderstandAgent(contextText, usageContext);

    onProgress?.('planning', 'Planning slide architecture', 24);
    const slidePlan = await this.slidePlanningAgent(categorized, inputPlan, usageContext);

    onProgress?.('content-map', 'Mapping content for each slide', 42);
    const mapped = await this.slideContentMapperAgent(slidePlan, categorized, usageContext);

    onProgress?.('visual-data', 'Extracting chart and visual data', 58);
    const structuredVisualData = await this.visualDataExtractionAgent(mapped, categorized, usageContext);

    onProgress?.('illustrations', 'Preparing slide illustrations', 70);
    
    const useImageKit = imageProvider === 'imagekit' && this.imageKitService.isConfigured();
    this.logger.log(`[PPT Pipeline] Image provider selection: requested=${imageProvider}, configured=${this.imageKitService.isConfigured()}, using=${useImageKit ? 'imagekit' : 'unsplash'}`);
    
    if (imageProvider === 'imagekit' && !this.imageKitService.isConfigured()) {
      this.logger.warn(`[PPT Pipeline] ImageKit requested but not configured - falling back to Unsplash`);
    }
    
    const illustrations = useImageKit
      ? await this.illustrationEngineAgentWithImageKit(mapped, usageContext)
      : await this.illustrationEngineAgent(mapped, usageContext);

    onProgress?.('theme', 'Generating presentation theme', 82);
    const theme = await this.themeEngineAgent(categorized, mapped, usageContext);

    onProgress?.('assemble', 'Assembling frontend-ready PPT JSON', 92);
    const slides = this.buildSlides(mapped, structuredVisualData, illustrations);
    const summary = this.buildSummary(categorized, slides);

    onProgress?.('done', 'PPT pipeline completed', 100);

    return {
      version: 'v2',
      title: slidePlan.title,
      categorizedRequest: categorized,
      slidePlan,
      theme,
      summary,
      slides,
    };
  }

  private buildSlides(
    mapped: SlideContentMap[],
    visualData: SlideVisualDataMap[],
    illustrations: IllustrationAsset[],
  ): PptSlidePayload[] {
    const illustrationBySlideId = new Map(illustrations.map((item) => [item.slideId, item]));
    const visualDataBySlideId = new Map(visualData.map((item) => [item.slideId, item.data]));

    return mapped.map((slide) => ({
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
      illustration:
        illustrationBySlideId.get(slide.slideId) ?? {
          slideId: slide.slideId,
          visualKey: slide.content.visual,
          imageUrl: `https://source.unsplash.com/1280x720/?${encodeURIComponent(slide.content.visual)}`,
          alt: `${slide.content.visual} illustration`,
          provider: 'unsplash-source',
        },
    }));
  }

  private buildSummary(categorized: CategorizedRequest, slides: PptSlidePayload[]) {
    const slideTypes = slides.reduce<Record<string, number>>((acc, slide) => {
      acc[slide.type] = (acc[slide.type] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalSlides: slides.length,
      objective: categorized.objective,
      audience: categorized.audience,
      keyPoints: categorized.keyPoints.slice(0, 6),
      slideTypes,
    };
  }

  private async categorizeAndUnderstandAgent(
    requestText: string,
    usageContext?: AgentUsageContext,
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
      const text = await this.askAi(prompt, { ...usageContext, callLabel: 'ppt.categorize' });
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
    usageContext?: AgentUsageContext,
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
      const text = await this.askAi(prompt, { ...usageContext, callLabel: 'ppt.slidePlanning' });
      const parsed = this.parseJson<SlidePlan>(text);
      if (!parsed || !parsed.title || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
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
          { id: 1, type: 'hero', title: categorized.topic || 'Overview', goal: 'Introduce vision' },
          { id: 2, type: 'problem', title: 'Current Problem', goal: 'Explain inefficiencies' },
          { id: 3, type: 'solution', title: 'Proposed Solution', goal: 'Show approach' },
          { id: 4, type: 'impact', title: 'Expected Impact', goal: 'Quantify benefits' },
          { id: 5, type: 'cta', title: 'Next Steps', goal: 'Drive decision' },
        ],
      };
    }
  }

  private async slideContentMapperAgent(
    plan: SlidePlan,
    categorized: CategorizedRequest,
    usageContext?: AgentUsageContext,
  ): Promise<SlideContentMap[]> {
    const results: SlideContentMap[] = [];

    for (const slide of plan.slides) {
      const prompt = `You are agent-3 of a PPT architecture.
Task: Create slide content for one slide.
write proper content and bulkyness according to slide type and goal but keep it concise.
visual list : ${this.visuals.join(', ')}
Layout list : ${this.layouts.join(', ')}
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
        const text = await this.askAi(prompt, {
          ...usageContext,
          callLabel: `ppt.slideContent.${slide.id}`,
        });
        const content = this.parseJson<SlideContent>(text);
        if (!content || !content.heading || !Array.isArray(content.bullets) || !content.visual) {
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
            bullets: [slide.goal, categorized.problem, categorized.objective].filter(Boolean),
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
    usageContext?: AgentUsageContext,
  ): Promise<IllustrationAsset[]> {
    this.logger.log(`[Unsplash] Generating illustrations for ${mappedSlides.length} slides using Unsplash source`);
    
    const prompt = `You are agent-4 illustration engine.
Task: for each visual key, return a short query phrase for free stock image search.
Return ONLY valid JSON array in this shape:
[
  { "slideId": 1, "visualKey": "string", "query": "string", "alt": "string" }
]
Slides:\n${JSON.stringify(
      mappedSlides.map((s) => ({ slideId: s.slideId, visual: s.content.visual, heading: s.content.heading })),
    )}`;

    try {
      const text = await this.askAi(prompt, { ...usageContext, callLabel: 'ppt.illustrations' });
      const queries = this.parseJson<Array<{ slideId: number; visualKey: string; query: string; alt: string }>>(text);
      if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Invalid illustration JSON');
      }

      this.logger.log(`[Unsplash] AI generated ${queries.length} image queries`);

      const results = queries.map((item) => {
        const imageUrl = `https://source.unsplash.com/1280x720/?${encodeURIComponent(item.query)}`;
        this.logger.log(`[Unsplash] Slide ${item.slideId}: "${item.visualKey}" -> ${imageUrl.substring(0, 80)}...`);
        return {
          slideId: item.slideId,
          visualKey: item.visualKey,
          imageUrl,
          alt: item.alt || `${item.visualKey} illustration`,
          provider: 'unsplash-source' as const,
        };
      });

      this.logger.log(`[Unsplash] Generated ${results.length} Unsplash URLs`);
      return results;
    } catch (error) {
      this.logger.error(`[Unsplash] Error generating illustrations: ${error instanceof Error ? error.message : 'unknown'}`);
      this.logger.warn(`[Unsplash] Falling back to default image URLs`);
      
      return mappedSlides.map((slide) => {
        const imageUrl = `https://source.unsplash.com/1280x720/?${encodeURIComponent(`${slide.content.visual} business presentation`)}`;
        this.logger.log(`[Unsplash] Slide ${slide.slideId} (fallback): "${slide.content.visual}" -> ${imageUrl.substring(0, 80)}...`);
        return {
          slideId: slide.slideId,
          visualKey: slide.content.visual,
          imageUrl,
          alt: `${slide.content.visual} illustration`,
          provider: 'unsplash-source' as const,
        };
      });
    }
  }

  /**
   * Generate illustrations using ImageKit AI image generation
   * This is an alternative to illustrationEngineAgent which uses Unsplash
   */
  async illustrationEngineAgentWithImageKit(
    mappedSlides: SlideContentMap[],
    usageContext?: AgentUsageContext,
  ): Promise<IllustrationAsset[]> {
    this.logger.log(`[ImageKit] Starting image generation for ${mappedSlides.length} slides`);
    this.logger.log(`[ImageKit] Service configured: ${this.imageKitService.isConfigured()}`);

    const prompt = `You are agent-4 illustration engine.
Task: for each visual key, return a detailed image generation prompt for AI image creation.
Return ONLY valid JSON array in this shape:
[
  { "slideId": 1, "visualKey": "string", "prompt": "string - detailed image generation prompt", "alt": "string" }
]
Slides:\n${JSON.stringify(
      mappedSlides.map((s) => ({ slideId: s.slideId, visual: s.content.visual, heading: s.content.heading })),
    )}`;

    try {
      const text = await this.askAi(prompt, { ...usageContext, callLabel: 'ppt.illustrations.imagekit' });
      const queries = this.parseJson<Array<{ slideId: number; visualKey: string; prompt: string; alt: string }>>(text);
      if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Invalid illustration JSON');
      }

      this.logger.log(`[ImageKit] AI generated ${queries.length} image prompts`);

      // Generate images with ImageKit in parallel
      const results = await Promise.all(
        queries.map(async (item) => {
          this.logger.log(`[ImageKit] Slide ${item.slideId}: Generating image for "${item.visualKey}"`);
          this.logger.log(`[ImageKit] Prompt: "${item.prompt.substring(0, 80)}..."`);
          
          const imageUrl = await this.imageKitService.buildImageUrlFromPrompt(item.prompt);
          
          if (imageUrl) {
            this.logger.log(`[ImageKit] Slide ${item.slideId}: SUCCESS - Image generated`);
            this.logger.log(`[ImageKit] URL: ${imageUrl.substring(0, 80)}...`);
          } else {
            this.logger.error(`[ImageKit] Slide ${item.slideId}: FAILED - Image generation returned null, falling back to Unsplash`);
          }
          
          return {
            slideId: item.slideId,
            visualKey: item.visualKey,
            imageUrl: imageUrl ?? `https://source.unsplash.com/1280x720/?${encodeURIComponent(item.prompt.slice(0, 50))}`,
            alt: item.alt || `${item.visualKey} illustration`,
            provider: imageUrl ? ('imagekit' as const) : ('unsplash-source' as const),
          };
        }),
      );

      const imagekitCount = results.filter(r => r.provider === 'imagekit').length;
      const unsplashCount = results.filter(r => r.provider === 'unsplash-source').length;
      this.logger.log(`[ImageKit] Completed: ${imagekitCount} ImageKit images, ${unsplashCount} Unsplash fallbacks`);

      return results;
    } catch (error) {
      this.logger.error(`[ImageKit] Error in illustration engine: ${error instanceof Error ? error.message : 'unknown'}`);
      this.logger.error(`[ImageKit] Falling back to Unsplash for all ${mappedSlides.length} slides`);
      
      // Fallback to generating with Unsplash
      return mappedSlides.map((slide) => {
        const imageUrl = `https://source.unsplash.com/1280x720/?${encodeURIComponent(`${slide.content.visual} business presentation`)}`;
        this.logger.log(`[Unsplash] Slide ${slide.slideId} (fallback): "${slide.content.visual}" -> ${imageUrl.substring(0, 80)}...`);
        return {
          slideId: slide.slideId,
          visualKey: slide.content.visual,
          imageUrl,
          alt: `${slide.content.visual} illustration`,
          provider: 'unsplash-source' as const,
        };
      });
    }
  }

  private async visualDataExtractionAgent(
    mappedSlides: SlideContentMap[],
    categorized: CategorizedRequest,
    usageContext?: AgentUsageContext,
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
      const text = await this.askAi(prompt, { ...usageContext, callLabel: 'ppt.visualData' });
      const parsed = this.parseJson<SlideVisualDataMap[]>(text);
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid visual structured data JSON');
      }

      return parsed
        .filter((item) => item && typeof item.slideId === 'number')
        .map((item) => ({ slideId: item.slideId, visual: item.visual, data: item.data || {} }));
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
    usageContext?: AgentUsageContext,
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
        return {
        backgroundColor: '#F9FAFB',
        primaryColor: '#0B04CF',
        secondaryColor: '#1208E8',
        textColor: '#0B04CF',
        accentColor: '#2563EB',
      };
    } catch (error) {
      this.logger.warn(`themeEngineAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`);
      return {
        backgroundColor: '#F9FAFB',
        primaryColor: '#0B04CF',
        secondaryColor: '#1208E8',
        textColor: '#0B04CF',
        accentColor: '#2563EB',
      };
    }
  }

  private async askAi(prompt: string, usageContext?: AgentUsageContext): Promise<string> {
    const model = process.env.PPT_AGENT_MODEL ?? process.env.BEDROCK_MODEL_ID ?? 'deepseek.v3-v1:0';
    const result = await this.aiService.generateWithBedrock(
      prompt,
      model,
      {
        inferenceConfig: {
          temperature: 0.2,
          maxTokens: 4000,
        },
      },
      usageContext,
    );
    return result.text;
  }

  private parseJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
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
    const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean);
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

  private buildContextText(rawIdea: string, memory?: DirectionAiMemory | null): string {
    if (!memory) return rawIdea;

    const lines: string[] = [];
    
    if (memory.project) {
      lines.push(`PROJECT PROFILE:`);
      if (memory.project.name) lines.push(`- Name: ${memory.project.name}`);
      if (memory.project.category) lines.push(`- Category: ${memory.project.category}`);
      if (memory.project.description) lines.push(`- Description: ${memory.project.description}`);
      if (memory.project.businessType) lines.push(`- Business Type: ${memory.project.businessType}`);
      if (memory.project.audience) lines.push(`- Target Audience: ${memory.project.audience}`);
      if (memory.project.objective) lines.push(`- Objective: ${memory.project.objective}`);
    }

    const qaPairs = memory.conversation?.filter(
      (c) => c.kind === 'clarification' || c.kind === 'reply'
    );
    if (qaPairs.length > 0) {
      lines.push(`\nUSER Q&A CONTEXT:`);
      for (const item of qaPairs) {
        lines.push(`- [${item.role}]: ${item.content.substring(0, 200)}`);
      }
    }

    if (memory.pendingQuestions?.length > 0) {
      lines.push(`\nPENDING QUESTIONS: ${memory.pendingQuestions.join(', ')}`);
    }

    const otherSummaries = Object.entries(memory.agentSummaries || {})
      .filter(([key]) => key !== 'PPT')
      .map(([key, summary]) => `${key}: ${summary.substring(0, 200)}`);
    if (otherSummaries.length > 0) {
      lines.push(`\nOTHER AGENT RESULTS:`);
      lines.push(...otherSummaries);
    }

    lines.push(`\nORIGINAL IDEA: ${rawIdea}`);

    return lines.join('\n');
  }
}
