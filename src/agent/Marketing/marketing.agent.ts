import { Injectable, Logger } from '@nestjs/common';
import MarketingData from '../../../knowleage/Marketing.json';
import { AiService } from 'src/ai/ai.service';
import type { AgentUsageContext } from '../types/agent-usage-context.type';

export type FinalMarketingPayload = {
  response_structure: Record<string, unknown>;
};

@Injectable()
export class MarketingAgent {
  private readonly logger = new Logger(MarketingAgent.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(private readonly aiService: AiService) {}

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async askAi(
    prompt: string,
    maxTokens: number = 4000,
    usageContext?: AgentUsageContext,
  ): Promise<string> {
    const model =
      process.env.MARKETING_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'deepseek.v3-v1:0';
    const result = await this.aiService.generateWithBedrock(
      prompt,
      model,
      {
        inferenceConfig: {
          temperature: 0.2,
          maxTokens: maxTokens,
        },
      },
      usageContext,
    );
    return result.text;
  }

  private cleanAndExtractJson(text: string): string {
    let cleaned = text.trim();
    
    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    
    // Try to extract JSON object from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    return cleaned;
  }

  private async executePromptWithValidation(
    prompt: string, 
    sectionName: string, 
    maxTokens: number = 4000,
    retryCount: number = 0,
    usageContext?: AgentUsageContext,
  ): Promise<any> {
    try {
      const aiResponse = await this.askAi(prompt, maxTokens, usageContext);
      
      let cleanedResponse = this.cleanAndExtractJson(aiResponse);
      
      // Try to parse, if fails and we have retries left, try again
      try {
        const parsedResponse = JSON.parse(cleanedResponse);
        this.logger.log(`Successfully parsed ${sectionName}`);
        return parsedResponse;
      } catch (parseError: any) {
        // If this is a truncation issue, try to fix common JSON truncation problems
        if (cleanedResponse.length > 0 && !this.isValidJson(cleanedResponse)) {
          const fixedResponse = this.attemptFixTruncatedJson(cleanedResponse);
          if (fixedResponse) {
            try {
              const parsedResponse = JSON.parse(fixedResponse);
              this.logger.log(`Successfully parsed ${sectionName} after fixing truncation`);
              return parsedResponse;
            } catch (fixError) {
              // Fix didn't work, continue to retry
            }
          }
        }
        
        throw parseError;
      }
    } catch (error: any) {
      this.logger.error(`Failed to parse ${sectionName} response as JSON (attempt ${retryCount + 1}/${this.MAX_RETRIES})`, { 
        error: error.message 
      });
      
      // Retry logic
      if (retryCount < this.MAX_RETRIES - 1) {
        this.logger.log(`Retrying ${sectionName}...`);
        await this.delay(this.RETRY_DELAY_MS * (retryCount + 1));
        
        // Modify prompt for retry to be more explicit
        const retryPrompt = this.createRetryPrompt(prompt, sectionName);
        return this.executePromptWithValidation(
          retryPrompt,
          sectionName,
          maxTokens,
          retryCount + 1,
          {
            ...usageContext,
            callLabel: `${usageContext?.callLabel ?? sectionName}.retry${retryCount + 1}`,
          },
        );
      }
      
      throw new Error(`Failed to parse ${sectionName} response as JSON after ${this.MAX_RETRIES} attempts`);
    }
  }

  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  private attemptFixTruncatedJson(truncatedJson: string): string | null {
    // Try to fix common truncation issues
    try {
      // Count opening and closing braces/brackets
      const openBraces = (truncatedJson.match(/{/g) || []).length;
      const closeBraces = (truncatedJson.match(/}/g) || []).length;
      const openBrackets = (truncatedJson.match(/\[/g) || []).length;
      const closeBrackets = (truncatedJson.match(/\]/g) || []).length;
      
      let fixed = truncatedJson;
      
      // Close any unclosed arrays
      if (openBrackets > closeBrackets) {
        const missing = openBrackets - closeBrackets;
        fixed += ']'.repeat(missing);
      }
      
      // Close any unclosed objects
      if (openBraces > closeBraces) {
        const missing = openBraces - closeBraces;
        fixed += '}'.repeat(missing);
      }
      
      // Remove trailing commas
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      // If last character is a comma, remove it
      if (fixed.endsWith(',')) {
        fixed = fixed.slice(0, -1);
      }
      
      // Try to parse the fixed version
      if (this.isValidJson(fixed)) {
        return fixed;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private createRetryPrompt(originalPrompt: string, sectionName: string): string {
    return `${originalPrompt}

IMPORTANT: Your previous response for ${sectionName} was incomplete or had invalid JSON format.

Please ensure:
1. Return ONLY valid JSON (no markdown formatting, no extra text)
2. Complete the ENTIRE JSON structure
3. Do not truncate arrays or objects
4. Ensure all strings are properly closed with double quotes
5. No trailing commas
6. All braces and brackets must be properly closed

Make sure your response is a complete, valid JSON object that can be parsed with JSON.parse().`;
  }

  // Split section 3 into smaller sub-sections
  private async executeSection3WithSplit(input: string, usageContext?: AgentUsageContext): Promise<any> {
    this.logger.log('Executing Section 3 with sub-splits');
    
    const contentStrategyPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "recommended_content_types": [],
      "hook_strategies": [],
      "content_angles": [],
      "storytelling_style": "",
      "authority_building_strategy": "",
      "trust_building_strategy": ""
    }`;
    
    const funnelPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "awareness_stage": {
        "user_state": "",
        "best_platforms": [],
        "best_content": [],
        "cta": ""
      },
      "interest_stage": {
        "user_state": "",
        "best_platforms": [],
        "best_content": [],
        "cta": ""
      },
      "trust_stage": {
        "user_state": "",
        "best_platforms": [],
        "best_content": [],
        "cta": ""
      },
      "decision_stage": {
        "user_state": "",
        "best_platforms": [],
        "best_content": [],
        "cta": ""
      },
      "action_stage": {
        "user_state": "",
        "best_platforms": [],
        "best_content": [],
        "cta": ""
      }
    }`;
    
    const [contentStrategy, funnel] = await Promise.all([
      this.executePromptWithValidation(contentStrategyPrompt, 'Section 3a (Content Strategy)', 3000, 0, { ...usageContext, callLabel: 'marketing.contentStrategy' }),
      this.executePromptWithValidation(funnelPrompt, 'Section 3b (Customer Journey Funnel)', 3000, 0, { ...usageContext, callLabel: 'marketing.customerJourneyFunnel' })
    ]);
    
    return {
      content_strategy: contentStrategy,
      customer_journey_funnel: funnel
    };
  }

  // Split section 4 into sub-sections
  private async executeSection4WithSplit(input: string, usageContext?: AgentUsageContext): Promise<any> {
    this.logger.log('Executing Section 4 with sub-splits');
    
    const conversionPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "lead_magnets": [],
      "offers": [],
      "conversion_triggers": [],
      "scarcity_strategy": "",
      "social_proof_strategy": "",
      "risk_reversal_strategy": ""
    }`;
    
    const growthPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "organic_growth_methods": [],
      "paid_growth_methods": [],
      "seo_opportunities": [],
      "community_growth": [],
      "personal_branding_opportunities": [],
      "viral_growth_opportunities": []
    }`;
    
    const [conversionStrategy, growthStrategy] = await Promise.all([
      this.executePromptWithValidation(conversionPrompt, 'Section 4a (Conversion Strategy)', 3000, 0, { ...usageContext, callLabel: 'marketing.conversionStrategy' }),
      this.executePromptWithValidation(growthPrompt, 'Section 4b (Growth Strategy)', 3000, 0, { ...usageContext, callLabel: 'marketing.growthStrategy' })
    ]);
    
    return {
      conversion_strategy: conversionStrategy,
      growth_strategy: growthStrategy
    };
  }

  // Split section 5 into sub-sections
  private async executeSection5WithSplit(input: string, usageContext?: AgentUsageContext): Promise<any> {
    this.logger.log('Executing Section 5 with sub-splits');
    
    const brandingPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "brand_positioning": "",
      "brand_personality": "",
      "brand_emotion": "",
      "brand_identity": "",
      "premium_or_mass_market": "",
      "authority_strategy": ""
    }`;
    
    const purchaseBehaviorPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "purchase_type": "",
      "decision_speed": "",
      "research_depth": "",
      "logic_vs_emotion_ratio": "",
      "social_proof_dependency": "",
      "creator_influence_level": ""
    }`;
    
    const marketPositioningPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "competition_level": "",
      "blue_ocean_opportunity": "",
      "market_maturity": "",
      "competitive_advantages": [],
      "weaknesses": [],
      "differentiation_strategy": ""
    }`;
    
    const [brandingStrategy, purchaseBehavior, marketPositioning] = await Promise.all([
      this.executePromptWithValidation(brandingPrompt, 'Section 5a (Branding Strategy)', 3000, 0, { ...usageContext, callLabel: 'marketing.brandingStrategy' }),
      this.executePromptWithValidation(purchaseBehaviorPrompt, 'Section 5b (Purchase Behavior)', 3000, 0, { ...usageContext, callLabel: 'marketing.purchaseBehavior' }),
      this.executePromptWithValidation(marketPositioningPrompt, 'Section 5c (Market Positioning)', 3000, 0, { ...usageContext, callLabel: 'marketing.marketPositioning' })
    ]);
    
    return {
      branding_strategy: brandingStrategy,
      purchase_behavior_analysis: purchaseBehavior,
      market_positioning: marketPositioning
    };
  }

  // Split section 6 into sub-sections
  private async executeSection6WithSplit(input: string, usageContext?: AgentUsageContext): Promise<any> {
    this.logger.log('Executing Section 6 with sub-splits');
    
    const automationPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "possible_automations": [],
      "ai_agent_opportunities": [],
      "workflow_automations": [],
      "crm_automation": [],
      "marketing_automation": []
    }`;
    
    const riskPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "biggest_business_risks": [],
      "customer_trust_risks": [],
      "scaling_risks": [],
      "platform_dependency_risks": [],
      "content_risks": []
    }`;
    
    const insightsPrompt = `
    You are a marketing expert. Based on this business idea: ${input}
    
    Return ONLY valid JSON with this structure:
    {
      "hidden_opportunities": [],
      "psychological_observations": [],
      "likely_conversion_barriers": [],
      "trust_breaking_points": [],
      "high_leverage_actions": []
    }`;
    
    const [automation, risk, insights] = await Promise.all([
      this.executePromptWithValidation(automationPrompt, 'Section 6a (Automation)', 3000, 0, { ...usageContext, callLabel: 'marketing.automation' }),
      this.executePromptWithValidation(riskPrompt, 'Section 6b (Risk Analysis)', 3000, 0, { ...usageContext, callLabel: 'marketing.riskAnalysis' }),
      this.executePromptWithValidation(insightsPrompt, 'Section 6c (Deep Insights)', 3000, 0, { ...usageContext, callLabel: 'marketing.deepInsights' })
    ]);
    
    return {
      automation_and_ai_opportunities: automation,
      risk_analysis: risk,
      deep_strategic_insights: insights
    };
  }

  async runMarketingAgentPipeline(
    input: string,
    onProgress?: (stage: string, message: string, progress: number) => void,
    usageContext?: AgentUsageContext,
  ): Promise<FinalMarketingPayload> {
    this.logger.log('Running MarketingAgent pipeline with enhanced split strategy');
    onProgress?.('setup', 'Preparing marketing analysis sections', 8);

    // SECTION 1: Core Business Understanding (smaller, less likely to fail)
    const section1Prompt = `
    You are a marketing expert analyzing a business idea and provide strategy to acquire users.

    Analyze this idea: ${input}
    
    Return ONLY valid JSON with this exact structure (no other text):
    {
      "idea_understanding": {
        "business_summary": "",
        "core_problem_solved": "",
        "business_model_type": "",
        "market_category": "",
        "unique_value_proposition": ""
      },
      "target_audience": {
        "primary_audience": [],
        "secondary_audience": [],
        "age_group": "",
        "gender_skew": "",
        "geographic_focus": [],
        "income_level": "",
        "audience_type": "",
        "decision_makers": [],
        "audience_behavior": ""
      },
      "customer_psychology": {
        "main_pain_points": [],
        "main_desires": [],
        "main_fears": [],
        "identity_aspirations": [],
        "emotional_triggers": [],
        "fomo_triggers": [],
        "trust_factors": []
      }
    }`;

    // SECTION 2: Brain Triggers and Platform Strategy (smaller)
    const section2Prompt = `
    You are a marketing expert analyzing a business idea and provide strategy to acquire users.
    Based on the same business idea: ${input}
    
    Return ONLY valid JSON with this exact structure:
    {
      "brain_trigger_analysis": {
        "reptilian_brain_triggers": [],
        "limbic_brain_triggers": [],
        "neocortex_triggers": []
      },
      "platform_strategy": {
        "recommended_platforms": [
          {
            "platform_name": "",
            "reason": "",
            "audience_type": "",
            "best_content_formats": [],
            "goal": ""
          }
        ],
        "platform_priority_order": []
      }
    }`;

    // SECTION 7: Execution Priority and Final Summary (smallest)
    const section7Prompt = `
    You are a marketing expert analyzing a business idea and provide strategy to acquire users.
    Based on the same business idea: ${input}
    
    Return ONLY valid JSON with this exact structure:
    {
      "execution_priority": {
        "phase_1": [],
        "phase_2": [],
        "phase_3": [],
        "quick_wins": [],
        "long_term_assets": []
      },
      "final_summary": {
        "business_potential_score": "",
        "growth_potential": "",
        "recommended_primary_strategy": "",
        "recommended_acquisition_channel": "",
        "recommended_branding_angle": "",
        "final_strategic_recommendation": ""
      }
    }`;

    // Execute all sections with appropriate splitting
    onProgress?.('execution', 'Running sectioned marketing agents', 22);
    const [
      section1Result,
      section2Result,
      section3Result,
      section4Result,
      section5Result,
      section6Result,
      section7Result
    ] = await Promise.all([
      this.executePromptWithValidation(section1Prompt, 'Section 1 (Core Business)', 4000, 0, { ...usageContext, callLabel: 'marketing.coreBusiness' }),
      this.executePromptWithValidation(section2Prompt, 'Section 2 (Brain & Platform)', 3000, 0, { ...usageContext, callLabel: 'marketing.brainPlatform' }),
      this.executeSection3WithSplit(input, usageContext),
      this.executeSection4WithSplit(input, usageContext),
      this.executeSection5WithSplit(input, usageContext),
      this.executeSection6WithSplit(input, usageContext),
      this.executePromptWithValidation(section7Prompt, 'Section 7 (Execution & Summary)', 2500, 0, { ...usageContext, callLabel: 'marketing.executionSummary' })
    ]);
    onProgress?.('merge', 'Merging section outputs into final strategy', 88);

    // Merge all sections into the complete response structure
    const completeResponse: FinalMarketingPayload = {
      response_structure: {
        ...section1Result,
        ...section2Result,
        ...section3Result,
        ...section4Result,
        ...section5Result,
        ...section6Result,
        ...section7Result
      }
    };

    this.logger.log('Successfully merged all sections into complete response');
    onProgress?.('done', 'Marketing strategy pipeline completed', 100);
    return completeResponse;
  }
}
