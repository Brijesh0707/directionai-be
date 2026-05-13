import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { tavily } from '@tavily/core';

export interface TavilyWebSearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  topic?: 'general' | 'news';
  maxResults?: number;
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  includeImages?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

@Injectable()
export class MarketResearchService {
  private readonly logger = new Logger(MarketResearchService.name);

  private client = tavily({
    apiKey: process.env.TAVILY_API_KEY || '',
  });

  async TavilyWebSearch(options: TavilyWebSearchOptions) {
    this.logger.log(`TavilyWebSearch started for query=${options.query}`);

    try {
      const response = await this.client.search(options.query, {
        searchDepth: options.searchDepth || 'advanced',
        topic: options.topic || 'general',
        maxResults: options.maxResults || 10,
        includeAnswer: options.includeAnswer ?? true,
        includeRawContent: options.includeRawContent ? 'markdown' : undefined,
        includeImages: options.includeImages ?? false,
        includeDomains: options.includeDomains || [],
        excludeDomains: options.excludeDomains || [],
      });

      this.logger.log(`TavilyWebSearch completed for query=${options.query}`);

      return {
        success: true,
        query: options.query,
        data: response,
      };
    } catch (error: any) {
      this.logger.error(
        `Tavily search failed for query=${options.query}: ${error?.message || 'Unknown Error'}`,
      );

      throw new InternalServerErrorException({
        success: false,
        message: 'Failed to perform Tavily web search',
        error: error?.message || 'Unknown Error',
      });
    }
  }

  async marketResearch(query: string) {
    return this.TavilyWebSearch({
      query,
      searchDepth: 'advanced',
      topic: 'general',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async competitorResearch(companyName: string) {
    return this.TavilyWebSearch({
      query: `${companyName} competitors pricing market share funding`,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async pricingResearch(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} pricing plans subscription comparison
        enterprise pricing startup pricing
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async trendResearch(topic: string) {
    return this.TavilyWebSearch({
      query: `${topic} market trends 2026 growth future 5-10 years`,
      topic: 'news',
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async findTAM(industry: string) {
    return this.TavilyWebSearch({
      query: `
        ${industry} Total Addressable Market TAM size
        global market value CAGR future forecast
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async findSAM(product: string, targetAudience: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} Serviceable Available Market SAM
        for ${targetAudience}
        regional market size target customers
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async findSOM(product: string, competitors: string[]) {
    return this.TavilyWebSearch({
      query: `
        ${product} Serviceable Obtainable Market SOM
        competitors ${competitors.join(', ')}
        market penetration startup opportunity
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async redditReviews(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} reviews opinions user experience site:reddit.com
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
      includeDomains: ['reddit.com'],
    });
  }

  async youtubeReviews(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} review comparison best features problems site:youtube.com
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
      includeDomains: ['youtube.com'],
    });
  }

  async quoraReviews(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} opinions discussions user feedback site:quora.com
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
      includeDomains: ['quora.com'],
    });
  }

  async twitterSentiment(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} customer sentiment complaints praise site:x.com
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
      includeDomains: ['x.com'],
    });
  }

  async instagramInsights(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} instagram trends influencers reels viral marketing
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async customerPainPoints(product: string) {
    return this.TavilyWebSearch({
      query: `
        ${product} customer pain points complaints frustrations issues
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
      includeRawContent: true,
    });
  }

  async startupValidation(idea: string) {
    return this.TavilyWebSearch({
      query: `
        ${idea} demand market need competitors opportunities
        customer problems startup validation
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async aiStartupResearch(startupIdea: string) {
    return this.TavilyWebSearch({
      query: `
        ${startupIdea}
        YC startups competitors AI tools SaaS trends
        funding market opportunities
      `,
      topic: 'news',
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async swotAnalysis(company: string) {
    return this.TavilyWebSearch({
      query: `
        ${company} SWOT analysis strengths weaknesses opportunities threats
      `,
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async fundingResearch(startup: string) {
    return this.TavilyWebSearch({
      query: `
        ${startup} funding investors valuation seed series revenue
      `,
      topic: 'news',
      searchDepth: 'advanced',
      maxResults: 2,
      includeAnswer: true,
    });
  }

  async allPlatformReviews(product: string) {
    return Promise.all([
      this.redditReviews(product),
      this.youtubeReviews(product),
      this.quoraReviews(product),
      this.twitterSentiment(product),
      this.instagramInsights(product),
    ]);
  }
}
