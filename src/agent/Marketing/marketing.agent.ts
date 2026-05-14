import { Injectable, Logger } from '@nestjs/common';
import MarketingData from '../../../knowleage/Marketing.json';
import { AiService } from 'src/ai/ai.service';

@Injectable()
export class MarketingAgent {
  private readonly logger = new Logger(MarketingAgent.name);

  constructor(private readonly aiService: AiService) {}

  private async askAi(prompt: string): Promise<string> {
    const model =
      process.env.PPT_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'anthropic.claude-3-5-sonnet-20240620-v1:0';
    const result = await this.aiService.generateWithBedrock(prompt, model, {
      inferenceConfig: {
        temperature: 0.2,
        maxTokens: 8000,
      },
    });
    return result.text;
  }


  async runMarketingAgentPipeline(input: string){
    this.logger.log('Running MarketingAgent pipeline');

   const Prompt = `
   You are a marketing expert,
   use this knowleage : ${JSON.stringify(MarketingData)}
    to answer this idea : ${input}
   explain this topics:
   1. AUDIENCE ANALYSIS

2. CUSTOMER PSYCHOLOGY ANALYSIS
3. BRAIN TRIGGER ANALYSIS
A. Reptilian Brain Triggers
- Survival
- Urgency
- Speed
- Dominance
- Simplicity
- Fear

B. Limbic Brain Triggers
- Trust
- Belonging
- Status
- Emotional connection
- Social validation

C. Neocortex Triggers
- Logic
- ROI
- Feature comparison
- Long-term value
- Decision justification

4. PLATFORM SELECTION STRATEGY
5. CONTENT STRATEGY DESIGN
6. HOOK AND ATTENTION STRATEGY
7. CUSTOMER BUYING JOURNEY MAPPING
8. CONVERSION STRATEGY
9. ATTENTION TYPE ANALYSIS
10. ICP (IDEAL CUSTOMER PROFILE) CREATION
11. COMPETITION AND POSITIONING ANALYSIS
12. PURCHASE BEHAVIOR ANALYSIS
13. FUNNEL PLATFORM MAPPING
14. GROWTH STRATEGY DESIGN
15. BRANDING PSYCHOLOGY
16. CONTENT DISTRIBUTION SYSTEM
17. AI AND AUTOMATION OPPORTUNITIES
18. DEEP BUSINESS INSIGHTS

Strictly return JSON with this structure:
{
  "response_structure": {
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
    },

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
    },

    "content_strategy": {
      "recommended_content_types": [],
      "hook_strategies": [],
      "content_angles": [],
      "storytelling_style": "",
      "authority_building_strategy": "",
      "trust_building_strategy": ""
    },

    "customer_journey_funnel": {
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
    },

    "conversion_strategy": {
      "lead_magnets": [],
      "offers": [],
      "conversion_triggers": [],
      "scarcity_strategy": "",
      "social_proof_strategy": "",
      "risk_reversal_strategy": ""
    },

    "growth_strategy": {
      "organic_growth_methods": [],
      "paid_growth_methods": [],
      "seo_opportunities": [],
      "community_growth": [],
      "personal_branding_opportunities": [],
      "viral_growth_opportunities": []
    },

    "branding_strategy": {
      "brand_positioning": "",
      "brand_personality": "",
      "brand_emotion": "",
      "brand_identity": "",
      "premium_or_mass_market": "",
      "authority_strategy": ""
    },

    "purchase_behavior_analysis": {
      "purchase_type": "",
      "decision_speed": "",
      "research_depth": "",
      "logic_vs_emotion_ratio": "",
      "social_proof_dependency": "",
      "creator_influence_level": ""
    },

    "market_positioning": {
      "competition_level": "",
      "blue_ocean_opportunity": "",
      "market_maturity": "",
      "competitive_advantages": [],
      "weaknesses": [],
      "differentiation_strategy": ""
    },

    "automation_and_ai_opportunities": {
      "possible_automations": [],
      "ai_agent_opportunities": [],
      "workflow_automations": [],
      "crm_automation": [],
      "marketing_automation": []
    },

    "risk_analysis": {
      "biggest_business_risks": [],
      "customer_trust_risks": [],
      "scaling_risks": [],
      "platform_dependency_risks": [],
      "content_risks": []
    },

    "deep_strategic_insights": {
      "hidden_opportunities": [],
      "psychological_observations": [],
      "likely_conversion_barriers": [],
      "trust_breaking_points": [],
      "high_leverage_actions": []
    },

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
  }
}
   `
    const aiResponse = await this.askAi(Prompt);
    try {
    // Clean the response to extract JSON
    let cleanedResponse = aiResponse.trim();
    
    // Remove markdown code blocks if present
    cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '');
    cleanedResponse = cleanedResponse.replace(/^```\s*/i, '');
    cleanedResponse = cleanedResponse.replace(/\s*```$/i, '');
    
    // Try to find JSON if there's extra text
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }
    
    const parsedResponse = JSON.parse(cleanedResponse);
    return parsedResponse;
  } catch (error:any) {
    this.logger.error('Failed to parse AI response as JSON', { 
      aiResponse: aiResponse.substring(0, 500), // Log first 500 chars
      error: error.message 
    });
    throw new Error('Failed to parse AI response as JSON');
  }
  }


}
