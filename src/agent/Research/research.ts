import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { MarketResearchService } from './SearchAgent/market.research';

type ResearchSummary = {
  topic: string;
  companyOrProduct: string;
  audience: string;
  intent: string;
  competitors: string[];
};

type ResearchSectionResult = {
  section: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

export type FinalResearchPayload = {
  requestText: string;
  summarizedRequest: ResearchSummary;
  searchAgentResponses: ResearchSectionResult[];
  mergedResponse: string;
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
    onProgress?.('summarize', 'Summarizing research request', 10);

    const summarizedRequest = await this.summarizeRequestAgent(requestText);
    onProgress?.('aggregate-search', 'Collecting market and competitor signals', 34);
    const searchAgentResponses = await this.searchAggregationAgent(summarizedRequest);
    onProgress?.('merge', 'Merging and synthesizing findings', 58);
    const mergedResponse = await this.mergeResponsesAgent(requestText, searchAgentResponses);

    onProgress?.('done', 'Research pipeline completed', 100);

    this.logger.log('runResearchAgentPipeline completed');

    return {
      requestText,
      summarizedRequest,
      searchAgentResponses,
      mergedResponse,
    };
  }

  private async summarizeRequestAgent(requestText: string): Promise<ResearchSummary> {
    this.logger.log('summarizeRequestAgent started');

    const prompt = `You are a research pre-processing agent.
Summarize the user request into structured JSON.
Return ONLY valid JSON in this shape:
{
  "topic": "string",
  "companyOrProduct": "string",
  "audience": "string",
  "intent": "string",
  "competitors": ["string"]
}
User request:\n${requestText}`;

    try {
      const text = await this.askAi(prompt);
      const parsed = this.parseJson<ResearchSummary>(text);

      if (!parsed || !parsed.topic || !parsed.companyOrProduct || !Array.isArray(parsed.competitors)) {
        throw new Error('Invalid summarized request JSON');
      }

      this.logger.log('summarizeRequestAgent completed using AI');
      return parsed;
    } catch (error) {
      this.logger.warn(
        `summarizeRequestAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      return {
        topic: requestText,
        companyOrProduct: requestText,
        audience: 'General',
        intent: 'Market research and validation',
        competitors: ['Competitor A', 'Competitor B', 'Competitor C'],
      };
    }
  }

  private async searchAggregationAgent(
    summary: ResearchSummary,
  ): Promise<ResearchSectionResult[]> {
    this.logger.log('searchAggregationAgent started');

    const product = summary.companyOrProduct || summary.topic;
    const targetAudience = summary.audience || 'General audience';
    const competitors = summary.competitors?.length
      ? summary.competitors
      : ['Competitor A', 'Competitor B'];

    const tasks: Array<{ section: string; run: () => Promise<unknown> }> = [
      { section: 'marketResearch', run: () => this.marketResearchService.marketResearch(summary.topic) },
      { section: 'competitorResearch', run: () => this.marketResearchService.competitorResearch(product) },
      { section: 'pricingResearch', run: () => this.marketResearchService.pricingResearch(product) },
      { section: 'trendResearch', run: () => this.marketResearchService.trendResearch(summary.topic) },
      { section: 'findTAM', run: () => this.marketResearchService.findTAM(summary.topic) },
      { section: 'findSAM', run: () => this.marketResearchService.findSAM(product, targetAudience) },
      { section: 'findSOM', run: () => this.marketResearchService.findSOM(product, competitors) },
      { section: 'redditReviews', run: () => this.marketResearchService.redditReviews(product) },
      { section: 'youtubeReviews', run: () => this.marketResearchService.youtubeReviews(product) },
      { section: 'quoraReviews', run: () => this.marketResearchService.quoraReviews(product) },
      { section: 'twitterSentiment', run: () => this.marketResearchService.twitterSentiment(product) },
      { section: 'instagramInsights', run: () => this.marketResearchService.instagramInsights(product) },
      { section: 'customerPainPoints', run: () => this.marketResearchService.customerPainPoints(product) },
      { section: 'startupValidation', run: () => this.marketResearchService.startupValidation(summary.topic) },
      { section: 'aiStartupResearch', run: () => this.marketResearchService.aiStartupResearch(summary.topic) },
      { section: 'swotAnalysis', run: () => this.marketResearchService.swotAnalysis(product) },
      { section: 'fundingResearch', run: () => this.marketResearchService.fundingResearch(product) },
      { section: 'allPlatformReviews', run: () => this.marketResearchService.allPlatformReviews(product) },
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

      const errorMessage = item.reason instanceof Error ? item.reason.message : 'Unknown error';
      this.logger.warn(`searchAggregationAgent failed ${section}: ${errorMessage}`);
      return { section, success: false, error: errorMessage };
    });

    this.logger.log('searchAggregationAgent completed');
    return results;
  }

  private async mergeResponsesAgent(
    requestText: string,
    responses: ResearchSectionResult[],
  ): Promise<string> {
    this.logger.log('mergeResponsesAgent started');

    const prompt = `You are a research synthesis agent.
Merge all successful search outputs into a single clear response.
Include:
1) Executive summary
2) Key market insights
3) Competitor and pricing highlights
4) Customer sentiment and pain points
5) Risks and opportunities
6) Actionable next steps
Keep it factual and concise.
User request:\n${requestText}
Search outputs:\n${JSON.stringify(responses)}`;

    try {
      const text = await this.askAi(prompt);
      this.logger.log('mergeResponsesAgent completed using AI');
      return text;
    } catch (error) {
      const fallback = responses
        .filter((item) => item.success)
        .map((item) => `## ${item.section}\n${JSON.stringify(item.data)}`)
        .join('\n\n');

      this.logger.warn(
        `mergeResponsesAgent fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      return fallback || 'Unable to merge responses. No successful search results found.';
    }
  }

  private async askAi(prompt: string): Promise<string> {
    const model =
      process.env.RESEARCH_AGENT_MODEL ??
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
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

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
}
