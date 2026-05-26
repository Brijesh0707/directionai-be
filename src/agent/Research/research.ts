import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { MarketResearchService } from './SearchAgent/market.research';

type ResearchSummary = {
  topic: string;
  companyOrProduct: string;
  audience: string;
  intent: string;
  competitors: string[];
  searchKeywords: {
    marketResearch: string;
    competitorResearch: string;
    pricingResearch: string;
    trendResearch: string;
    tamKeywords: string;
    samKeywords: string;
    somKeywords: string;
    redditKeywords: string;
    youtubeKeywords: string;
    quoraKeywords: string;
    twitterKeywords: string;
    instagramKeywords: string;
    painPointsKeywords: string;
    startupValidationKeywords: string;
    aiStartupKeywords: string;
    swotKeywords: string;
    fundingKeywords: string;
  };
};

type ResearchSectionResult = {
  section: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

// Shape that each per-section AI call must return
type StructuredSectionData = {
  answer: string;
  query: string;
  results: Array<{
    title: string;
    content: string;
    url: string;
    snippet: string;
    source: string;
  }>;
  images: Array<{
    url: string;
    altText: string;
    source: string;
  }>;
};

export type FinalResearchPayload = {
  mergedResponse: JSON | string;
};

@Injectable()
export class ResearchAgentService {
  private readonly logger = new Logger(ResearchAgentService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly marketResearchService: MarketResearchService,
  ) {}

  async runResearchAgentPipeline(
    requestText: string,
    onProgress?: (stage: string, message: string, progress: number) => void,
  ): Promise<FinalResearchPayload> {
    this.logger.log('runResearchAgentPipeline started');
    onProgress?.(
      'summarize',
      'Summarizing research request and generating search keywords',
      10,
    );

    const summarizedRequest = await this.summarizeRequestAgent(requestText);

    onProgress?.(
      'aggregate-search',
      'Collecting market and competitor signals with optimized keywords',
      34,
    );
    const searchAgentResponses =
      await this.searchAggregationAgent(summarizedRequest);

    onProgress?.('merge', 'Merging and synthesizing findings', 58);

    // ✅ Each section gets its own small AI call → then manually merge into final JSON
    const mergedResponse = await this.mergeResponsesAgent(
      requestText,
      searchAgentResponses,
    );

    onProgress?.('done', 'Research pipeline completed', 100);
    this.logger.log('runResearchAgentPipeline completed');

    return { mergedResponse };
  }

  // ---------------------------------------------------------------------------
  // SUMMARIZE REQUEST AGENT  (unchanged logic)
  // ---------------------------------------------------------------------------
  private async summarizeRequestAgent(
    requestText: string,
  ): Promise<ResearchSummary> {
    this.logger.log('summarizeRequestAgent started');

    const prompt = `You are a research pre-processing agent. Your task is to analyze the user request and generate SPECIFIC search keywords for each research dimension.

User Request: "${requestText}"

Return ONLY valid JSON in this exact shape. Generate SPECIFIC, TARGETED keywords (not the whole user request):

{
  "topic": "main topic/subject",
  "companyOrProduct": "specific company or product name",
  "audience": "target audience",
  "intent": "research intent/purpose",
  "competitors": ["competitor1", "competitor2", "competitor3"],
  "searchKeywords": {
    "marketResearch": "specific keywords for market size/demand research",
    "competitorResearch": "specific keywords to find competitors and their market share",
    "pricingResearch": "specific keywords for pricing models and plans",
    "trendResearch": "specific keywords for future trends and growth",
    "tamKeywords": "specific keywords for Total Addressable Market size",
    "samKeywords": "specific keywords for Serviceable Available Market",
    "somKeywords": "specific keywords for Serviceable Obtainable Market",
    "redditKeywords": "specific keywords for Reddit discussions and reviews",
    "youtubeKeywords": "specific keywords for YouTube reviews and comparisons",
    "quoraKeywords": "specific keywords for Quora Q&A and discussions",
    "twitterKeywords": "specific keywords for Twitter/X sentiment and feedback",
    "instagramKeywords": "specific keywords for Instagram trends and influencers",
    "painPointsKeywords": "specific keywords for customer pain points and frustrations",
    "startupValidationKeywords": "specific keywords for startup idea validation",
    "aiStartupKeywords": "specific keywords for AI startup research",
    "swotKeywords": "specific keywords for SWOT analysis",
    "fundingKeywords": "specific keywords for funding and investment research"
  }
}

IMPORTANT RULES:
1. Each keyword string MUST be a focused search query (3-7 words max)
2. Do NOT copy the entire user request into keywords
3. Extract ONLY the essential terms
4. Make keywords specific and actionable for web search
5. For TAM/SAM/SOM, include industry/geography if mentioned

Example:
If request is "Research the AI chatbot market for customer service, focusing on companies like Intercom and Drift for enterprise customers"
Then:
- marketResearch: "AI chatbot customer service market size"
- competitorResearch: "Intercom Drift competitors enterprise"
- pricingResearch: "AI chatbot enterprise pricing plans"
- trendResearch: "AI customer service trends 2025"
- tamKeywords: "AI chatbot global market value"
- samKeywords: "enterprise AI chatbot market size"
- somKeywords: "AI chatbot market penetration rate"`;

    try {
      const text = await this.askAi(prompt);
      const parsed = this.parseJson<ResearchSummary>(text);

      if (
        !parsed ||
        !parsed.topic ||
        !parsed.companyOrProduct ||
        !Array.isArray(parsed.competitors) ||
        !parsed.searchKeywords
      ) {
        throw new Error(
          'Invalid summarized request JSON - missing required fields',
        );
      }

      const requiredKeywords = [
        'marketResearch',
        'competitorResearch',
        'pricingResearch',
        'trendResearch',
        'tamKeywords',
        'samKeywords',
        'somKeywords',
        'redditKeywords',
        'youtubeKeywords',
        'quoraKeywords',
        'twitterKeywords',
        'instagramKeywords',
        'painPointsKeywords',
        'startupValidationKeywords',
        'aiStartupKeywords',
        'swotKeywords',
        'fundingKeywords',
      ];

      for (const key of requiredKeywords) {
        if (!parsed.searchKeywords[key as keyof typeof parsed.searchKeywords]) {
          this.logger.warn(`Missing keyword ${key}, using fallback`);
          parsed.searchKeywords[key as keyof typeof parsed.searchKeywords] =
            parsed.topic;
        }
      }

      this.logger.log('summarizeRequestAgent completed successfully');
      this.logger.debug(
        `Generated keywords: ${JSON.stringify(parsed.searchKeywords)}`,
      );
      return parsed;
    } catch (error) {
      this.logger.warn(
        `summarizeRequestAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      const fallbackKeywords = this.generateFallbackKeywords(requestText);
      return {
        topic: requestText.substring(0, 100),
        companyOrProduct: requestText.substring(0, 50),
        audience: 'General',
        intent: 'Market research and validation',
        competitors: ['Competitor A', 'Competitor B', 'Competitor C'],
        searchKeywords: fallbackKeywords,
      };
    }
  }

  private generateFallbackKeywords(
    requestText: string,
  ): ResearchSummary['searchKeywords'] {
    const words = requestText.split(' ').slice(0, 5).join(' ');
    return {
      marketResearch: `${words} market size`,
      competitorResearch: `${words} competitors`,
      pricingResearch: `${words} pricing`,
      trendResearch: `${words} trends`,
      tamKeywords: `${words} total addressable market`,
      samKeywords: `${words} serviceable market`,
      somKeywords: `${words} obtainable market`,
      redditKeywords: `${words} reviews reddit`,
      youtubeKeywords: `${words} review youtube`,
      quoraKeywords: `${words} quora`,
      twitterKeywords: `${words} twitter`,
      instagramKeywords: `${words} instagram`,
      painPointsKeywords: `${words} problems complaints`,
      startupValidationKeywords: `${words} validation`,
      aiStartupKeywords: `${words} AI startup`,
      swotKeywords: `${words} SWOT analysis`,
      fundingKeywords: `${words} funding investment`,
    };
  }

  // ---------------------------------------------------------------------------
  // SEARCH AGGREGATION AGENT  (unchanged logic)
  // ---------------------------------------------------------------------------
  private async searchAggregationAgent(
    summary: ResearchSummary,
  ): Promise<ResearchSectionResult[]> {
    this.logger.log('searchAggregationAgent started');

    const keywords = summary.searchKeywords;

    const tasks: Array<{ section: string; run: () => Promise<unknown> }> = [
      {
        section: 'marketResearch',
        run: () =>
          this.marketResearchService.marketResearch(keywords.marketResearch),
      },
      {
        section: 'competitorResearch',
        run: () =>
          this.marketResearchService.competitorResearch(
            keywords.competitorResearch,
          ),
      },
      {
        section: 'pricingResearch',
        run: () =>
          this.marketResearchService.pricingResearch(keywords.pricingResearch),
      },
      {
        section: 'trendResearch',
        run: () =>
          this.marketResearchService.trendResearch(keywords.trendResearch),
      },
      {
        section: 'findTAM',
        run: () => this.marketResearchService.findTAM(keywords.tamKeywords),
      },
      {
        section: 'findSAM',
        run: () =>
          this.marketResearchService.findSAM(
            keywords.samKeywords,
            summary.audience,
          ),
      },
      {
        section: 'findSOM',
        run: () =>
          this.marketResearchService.findSOM(
            keywords.somKeywords,
            summary.competitors,
          ),
      },
      {
        section: 'redditReviews',
        run: () =>
          this.marketResearchService.redditReviews(keywords.redditKeywords),
      },
      {
        section: 'youtubeReviews',
        run: () =>
          this.marketResearchService.youtubeReviews(keywords.youtubeKeywords),
      },
      {
        section: 'quoraReviews',
        run: () =>
          this.marketResearchService.quoraReviews(keywords.quoraKeywords),
      },
      {
        section: 'twitterSentiment',
        run: () =>
          this.marketResearchService.twitterSentiment(keywords.twitterKeywords),
      },
      {
        section: 'instagramInsights',
        run: () =>
          this.marketResearchService.instagramInsights(
            keywords.instagramKeywords,
          ),
      },
      {
        section: 'customerPainPoints',
        run: () =>
          this.marketResearchService.customerPainPoints(
            keywords.painPointsKeywords,
          ),
      },
      {
        section: 'startupValidation',
        run: () =>
          this.marketResearchService.startupValidation(
            keywords.startupValidationKeywords,
          ),
      },
      {
        section: 'aiStartupResearch',
        run: () =>
          this.marketResearchService.aiStartupResearch(
            keywords.aiStartupKeywords,
          ),
      },
      {
        section: 'swotAnalysis',
        run: () =>
          this.marketResearchService.swotAnalysis(keywords.swotKeywords),
      },
      {
        section: 'fundingResearch',
        run: () =>
          this.marketResearchService.fundingResearch(keywords.fundingKeywords),
      },
      {
        section: 'allPlatformReviews',
        run: () =>
          this.marketResearchService.allPlatformReviews(
            summary.companyOrProduct,
          ),
      },
    ];

    const settled = await Promise.allSettled(
      tasks.map(async (task) => {
        this.logger.log(`searchAggregationAgent running ${task.section}`);
        const data = await task.run();
        this.logger.log(`searchAggregationAgent completed ${task.section}`);
        return { section: task.section, data };
      }),
    );

    const results: ResearchSectionResult[] = settled.map((item, index) => {
      const section = tasks[index].section;

      if (item.status === 'fulfilled') {
        return { section, success: true, data: item.value.data };
      }

      const errorMessage =
        item.reason instanceof Error ? item.reason.message : 'Unknown error';
      this.logger.warn(
        `searchAggregationAgent failed ${section}: ${errorMessage}`,
      );
      return { section, success: false, error: errorMessage };
    });

    this.logger.log('searchAggregationAgent completed');
    return results;
  }

  // ---------------------------------------------------------------------------
  // MERGE RESPONSES AGENT
  // ✅ KEY CHANGE: Each section gets its own focused AI call (small output),
  //    then we manually assemble the final JSON — zero AI in the merge step.
  // ---------------------------------------------------------------------------
  private async mergeResponsesAgent(
    requestText: string,
    responses: ResearchSectionResult[],
  ): Promise<string> {
    this.logger.log('mergeResponsesAgent started — per-section AI structuring');

    const successfulResponses = responses.filter((r) => r.success);
    const failedResponses = responses.filter((r) => !r.success);

    this.logger.log(
      `Successful: ${successfulResponses.length}, Failed: ${failedResponses.length}`,
    );

    // Run every section's small AI structuring call in parallel
    const structuredSections = await Promise.allSettled(
      successfulResponses.map((r) =>
        this.structureSingleSection(r.section, r.data),
      ),
    );

    // Map section name → structured data (or null on failure)
    const sectionMap = new Map<string, StructuredSectionData[] | StructuredSectionData | null>();

    successfulResponses.forEach((r, idx) => {
      const result = structuredSections[idx];
      if (result.status === 'fulfilled') {
        sectionMap.set(r.section, result.value);
      } else {
        this.logger.warn(
          `structureSingleSection failed for ${r.section}: ${
            result.reason instanceof Error
              ? result.reason.message
              : 'unknown'
          }`,
        );
        sectionMap.set(r.section, null);
      }
    });

    // Helper — returns section data or a typed null-result entry
    const getSection = (
      key: string,
    ): { success: boolean; data: StructuredSectionData[] | StructuredSectionData | null } => {
      if (sectionMap.has(key)) {
        const data = sectionMap.get(key) ?? null;
        return { success: data !== null, data };
      }
      // Section either failed at search level or was never requested
      return { success: false, data: null };
    };

    const failedSectionNames = failedResponses.map((f) => f.section);

    // ✅ Manually assemble — identical shape to your original output contract
    const finalJson = {
      researchMetadata: {
        originalRequest: requestText,
        timestamp: new Date().toISOString(),
        totalSectionsRequested: responses.length,
        successfulSections: successfulResponses.length,
        failedSections: failedResponses.length,
        failedSectionNames,
      },
      marketResearchData: {
        marketResearch: getSection('marketResearch'),
        competitorResearch: getSection('competitorResearch'),
        pricingResearch: getSection('pricingResearch'),
        trendResearch: getSection('trendResearch'),
      },
      marketSizingData: {
        tam: getSection('findTAM'),
        sam: getSection('findSAM'),
        som: getSection('findSOM'),
      },
      socialSentimentData: {
        reddit: getSection('redditReviews'),
        youtube: getSection('youtubeReviews'),
        quora: getSection('quoraReviews'),
        twitter: getSection('twitterSentiment'),
        instagram: getSection('instagramInsights'),
        allPlatformsCombined: getSection('allPlatformReviews'),
      },
      customerInsightsData: {
        painPoints: getSection('customerPainPoints'),
      },
      startupData: {
        startupValidation: getSection('startupValidation'),
        aiStartupResearch: getSection('aiStartupResearch'),
        fundingResearch: getSection('fundingResearch'),
      },
      strategicAnalysisData: {
        swot: getSection('swotAnalysis'),
      },
      rawSearchResponses: {
        allSuccessfulResponses: successfulResponses.map((r) => ({
          section: r.section,
          data: r.data,
        })),
        responseMetadata: {
          totalResponseSize: `${(
            JSON.stringify(successfulResponses).length / 1024
          ).toFixed(2)} KB`,
          dataCompleteness: `${Math.round(
            (successfulResponses.length / responses.length) * 100,
          )}%`,
        },
      },
    };

    this.logger.log('mergeResponsesAgent completed — manual JSON assembly done');
    return JSON.stringify(finalJson, null, 2);
  }

  // ---------------------------------------------------------------------------
  // PER-SECTION AI STRUCTURING
  // Each call only needs to output one small StructuredSectionData object
  // — well within token budget even for cheap models.
  // ---------------------------------------------------------------------------
  private async structureSingleSection(
    section: string,
    rawData: unknown,
  ): Promise<StructuredSectionData[] | StructuredSectionData> {
    this.logger.log(`structureSingleSection started for: ${section}`);

    // allPlatformReviews returns a single object, others return arrays
    const isArraySection = section !== 'allPlatformReviews';

    const prompt = `You are a data structuring agent. Convert the raw search data below into the required JSON format.
DO NOT summarize, truncate, or modify any content. Preserve ALL data exactly as-is.
DO NOT output markdown, backticks, or any text outside the JSON.

Section: "${section}"
Raw Data:
${JSON.stringify(rawData, null, 2)}

${
  isArraySection
    ? `Return ONLY a JSON array. Each element must follow this shape:
[
  {
    "answer": "string",
    "query": "string",
    "results": [
      {
        "title": "string",
        "content": "string",
        "url": "string",
        "snippet": "string",
        "source": "string"
      }
    ],
    "images": [
      {
        "url": "string",
        "altText": "string",
        "source": "string"
      }
    ]
  }
]`
    : `Return ONLY a single JSON object with this shape:
{
  "answer": "string",
  "query": "string",
  "results": [
    {
      "title": "string",
      "content": "string",
      "url": "string",
      "snippet": "string",
      "source": "string"
    }
  ],
  "images": [
    {
      "url": "string",
      "altText": "string",
      "source": "string"
    }
  ]
}`
}

RULES:
1. Map existing fields to the required shape as closely as possible
2. Use empty string "" for missing string fields
3. Use empty array [] for missing array fields
4. Preserve all original text content verbatim`;

    try {
      const text = await this.askAi(prompt);
      const jsonText = this.extractJsonFromResponse(text);

      if (isArraySection) {
        const parsed = JSON.parse(jsonText) as StructuredSectionData[];
        this.logger.log(`structureSingleSection completed for: ${section}`);
        return Array.isArray(parsed) ? parsed : [parsed as unknown as StructuredSectionData];
      } else {
        const parsed = JSON.parse(jsonText) as StructuredSectionData;
        this.logger.log(`structureSingleSection completed for: ${section}`);
        return parsed;
      }
    } catch (error) {
      this.logger.warn(
        `structureSingleSection fallback for ${section}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      // Fallback: wrap raw data in required shape so pipeline never fully breaks
      const fallbackItem: StructuredSectionData = {
        answer: '',
        query: section,
        results: [
          {
            title: section,
            content: JSON.stringify(rawData),
            url: '',
            snippet: '',
            source: section,
          },
        ],
        images: [],
      };

      return isArraySection ? [fallbackItem] : fallbackItem;
    }
  }

  // ---------------------------------------------------------------------------
  // SHARED UTILITIES  (unchanged)
  // ---------------------------------------------------------------------------
  private extractJsonFromResponse(text: string): string {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // Try array first, then object
    const firstBracket = cleaned.indexOf('[');
    const firstBrace = cleaned.indexOf('{');

    let start: number;
    let end: number;

    if (firstBracket !== -1 && (firstBracket < firstBrace || firstBrace === -1)) {
      start = firstBracket;
      end = cleaned.lastIndexOf(']');
    } else {
      start = firstBrace;
      end = cleaned.lastIndexOf('}');
    }

    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    return cleaned;
  }

  private async askAi(prompt: string): Promise<string> {
    const model =
      process.env.RESEARCH_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'deepseek.v3-v1:0';

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
        const objStart = cleaned.indexOf('{');
        const objEnd = cleaned.lastIndexOf('}');

        if (objStart >= 0 && objEnd > objStart) {
          try {
            return JSON.parse(cleaned.slice(objStart, objEnd + 1)) as T;
          } catch {
            return null;
          }
        }

        return null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FORMATTING UTILITY  (kept for any future use)
  // ---------------------------------------------------------------------------
  private formatSectionTitle(section: string): string {
    const titles: Record<string, string> = {
      marketResearch: 'Market Research',
      competitorResearch: 'Competitor Analysis',
      pricingResearch: 'Pricing Research',
      trendResearch: 'Market Trends',
      findTAM: 'Total Addressable Market (TAM)',
      findSAM: 'Serviceable Available Market (SAM)',
      findSOM: 'Serviceable Obtainable Market (SOM)',
      redditReviews: 'Reddit Sentiment Analysis',
      youtubeReviews: 'YouTube Reviews',
      quoraReviews: 'Quora Discussions',
      twitterSentiment: 'Twitter/X Sentiment',
      instagramInsights: 'Instagram Insights',
      customerPainPoints: 'Customer Pain Points',
      startupValidation: 'Startup Validation',
      aiStartupResearch: 'AI Startup Research',
      swotAnalysis: 'SWOT Analysis',
      fundingResearch: 'Funding Research',
      allPlatformReviews: 'Multi-Platform Review Analysis',
    };
    return titles[section] || section.replace(/([A-Z])/g, ' $1').trim();
  }
}