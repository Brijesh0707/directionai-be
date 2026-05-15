import { Injectable, Logger } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';

type ProjectUnderstanding = {
  project_summary: string;
  problem_statement: string;
  proposed_solution: string;
  project_category: string;
  target_users: string[];
  key_constraints: string[];
};

type DeliveryPlanning = {
  recommended_phases: Array<{
    phase_id: number;
    phase_name: string;
    phase_goal: string;
    expected_duration: string;
    key_deliverables: string[];
  }>;
  mvp_definition: string;
  final_release_definition: string;
  risks_and_dependencies: string[];
};

type UiUxSuggestion = {
  design_direction: string;
  color_palette: Array<{
    token: string;
    hex: string;
    usage: string;
  }>;
  typography_suggestion: {
    heading_font_style: string;
    body_font_style: string;
  };
  ui_patterns: string[];
  ux_principles: string[];
  style_references: Array<{
    reference_name: string;
    reference_type: string;
    reason: string;
  }>;
};

type DevelopmentScopeMap = {
  phase_scope: Array<{
    phase_id: number;
    items: Array<{
      development_id: string;
      title: string;
      description: string;
      scope_type: string;
      acceptance_criteria: string[];
    }>;
  }>;
};

type TechStackSuggestion = {
  recommended_stack: {
    frontend: string;
    backend: string;
    database: string;
    auth: string;
    hosting: string;
    observability: string;
  };
  alternatives: {
    frontend: string[];
    backend: string[];
    database: string[];
  };
  selection_reasoning: string[];
  tradeoffs: string[];
  bias_check_note: string;
};

type FinalDevelopmentSummary = {
  execution_summary: string;
  build_order: string[];
  estimated_timeline: string;
  quality_gates: string[];
  go_live_checklist: string[];
};

export type FinalDevelopmentPayload = {
  response_structure: {
    project_understanding: ProjectUnderstanding;
    delivery_planning: DeliveryPlanning;
    ui_ux_suggestion: UiUxSuggestion;
    development_scope_map: DevelopmentScopeMap;
    tech_stack_suggestion: TechStackSuggestion;
    final_development_summary: FinalDevelopmentSummary;
  };
};

@Injectable()
export class DevelopmentAgent {
  private readonly logger = new Logger(DevelopmentAgent.name);

  constructor(private readonly aiService: AiService) {}

  async runDevelopmentAgentPipeline(input: string): Promise<FinalDevelopmentPayload> {
    this.logger.log('Running DevelopmentAgent pipeline');

    const understanding = await this.executePromptWithValidation<ProjectUnderstanding>(
      this.buildUnderstandingPrompt(input),
      'project_understanding',
      ['project_summary', 'problem_statement', 'proposed_solution', 'project_category'],
    );

    const planning = await this.executePromptWithValidation<DeliveryPlanning>(
      this.buildPlanningPrompt(input, understanding),
      'delivery_planning',
      ['recommended_phases', 'mvp_definition', 'final_release_definition'],
    );

    const uiUx = await this.executePromptWithValidation<UiUxSuggestion>(
      this.buildUiUxPrompt(input, understanding),
      'ui_ux_suggestion',
      ['design_direction', 'color_palette', 'ui_patterns', 'style_references'],
    );

    const scopeMap = await this.executePromptWithValidation<DevelopmentScopeMap>(
      this.buildScopePrompt(input, planning),
      'development_scope_map',
      ['phase_scope'],
    );

    const techStack = await this.executePromptWithValidation<TechStackSuggestion>(
      this.buildTechStackPrompt(input, understanding),
      'tech_stack_suggestion',
      ['recommended_stack', 'selection_reasoning', 'tradeoffs', 'bias_check_note'],
    );

    const finalSummary = this.mergeFinalSummary(
      understanding,
      planning,
      uiUx,
      scopeMap,
      techStack,
    );

    return {
      response_structure: {
        project_understanding: understanding,
        delivery_planning: planning,
        ui_ux_suggestion: uiUx,
        development_scope_map: scopeMap,
        tech_stack_suggestion: techStack,
        final_development_summary: finalSummary,
      },
    };
  }

  private async askAi(prompt: string, maxTokens = 2500): Promise<string> {
    const model =
      process.env.DEVELOPMENT_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'anthropic.claude-3-5-sonnet-20240620-v1:0';
    const result = await this.aiService.generateWithBedrock(prompt, model, {
      inferenceConfig: {
        temperature: 0.2,
        maxTokens,
      },
    });
    return result.text;
  }

  private parseJson<T>(raw: string): T {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    return JSON.parse(cleaned) as T;
  }

  private validateRequiredKeys(value: unknown, requiredKeys: string[], sectionName: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${sectionName} must be a JSON object`);
    }
    for (const key of requiredKeys) {
      if (!(key in value)) {
        throw new Error(`${sectionName} missing required key: ${key}`);
      }
    }
  }

  private async executePromptWithValidation<T>(
    prompt: string,
    sectionName: string,
    requiredKeys: string[],
  ): Promise<T> {
    const aiResponse = await this.askAi(prompt);
    const parsed = this.parseJson<T>(aiResponse);
    this.validateRequiredKeys(parsed, requiredKeys, sectionName);
    this.logger.log(`Validated section: ${sectionName}`);
    return parsed;
  }

  private buildUnderstandingPrompt(input: string): string {
    return `You are Development Sub-Agent 1: Project Understanding.
STRICT WARNING:
- Return ONLY valid JSON.
- Do not include markdown, commentary, or extra keys.
Output schema:
{
  "project_summary": "string",
  "problem_statement": "string",
  "proposed_solution": "string",
  "project_category": "string",
  "target_users": ["string"],
  "key_constraints": ["string"]
}
User idea: ${input}`;
  }

  private buildPlanningPrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 2: Delivery Planning (MVP to Final).
STRICT WARNING:
- Return ONLY valid JSON.
- Do not include markdown, commentary, or extra keys.
Output schema:
{
  "recommended_phases": [
    {
      "phase_id": 1,
      "phase_name": "string",
      "phase_goal": "string",
      "expected_duration": "string",
      "key_deliverables": ["string"]
    }
  ],
  "mvp_definition": "string",
  "final_release_definition": "string",
  "risks_and_dependencies": ["string"]
}
User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private buildUiUxPrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 3: UI/UX Design Suggestions.
STRICT WARNING:
- Return ONLY valid JSON.
- Do not include markdown, commentary, or extra keys.
Output schema:
{
  "design_direction": "string",
  "color_palette": [
    { "token": "primary", "hex": "#000000", "usage": "string" }
  ],
  "typography_suggestion": {
    "heading_font_style": "string",
    "body_font_style": "string"
  },
  "ui_patterns": ["string"],
  "ux_principles": ["string"],
  "style_references": [
    {
      "reference_name": "string",
      "reference_type": "app|website|design-system",
      "reason": "string"
    }
  ]
}
User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private buildScopePrompt(input: string, planning: DeliveryPlanning): string {
    return `You are Development Sub-Agent 4: Phase-wise Scope Mapper.
STRICT WARNING:
- Return ONLY valid JSON.
- Do not include markdown, commentary, or extra keys.
Output schema:
{
  "phase_scope": [
    {
      "phase_id": 1,
      "items": [
        {
          "development_id": "DEV-1-001",
          "title": "string",
          "description": "string",
          "scope_type": "feature|infra|qa|security|ops",
          "acceptance_criteria": ["string"]
        }
      ]
    }
  ]
}
User idea: ${input}
Delivery planning: ${JSON.stringify(planning)}`;
  }

  private buildTechStackPrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 5: Neutral Tech Stack Advisor.
STRICT WARNING:
- Return ONLY valid JSON.
- Do not include markdown, commentary, or extra keys.
- Be unbiased: evaluate options by requirements, scale, cost, team skill, and maintainability.
Output schema:
{
  "recommended_stack": {
    "frontend": "string",
    "backend": "string",
    "database": "string",
    "auth": "string",
    "hosting": "string",
    "observability": "string"
  },
  "alternatives": {
    "frontend": ["string"],
    "backend": ["string"],
    "database": ["string"]
  },
  "selection_reasoning": ["string"],
  "tradeoffs": ["string"],
  "bias_check_note": "string"
}
User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private mergeFinalSummary(
    understanding: ProjectUnderstanding,
    planning: DeliveryPlanning,
    uiUx: UiUxSuggestion,
    scopeMap: DevelopmentScopeMap,
    techStack: TechStackSuggestion,
  ): FinalDevelopmentSummary {
    const phaseNames = planning.recommended_phases
      .sort((a, b) => a.phase_id - b.phase_id)
      .map((phase) => `Phase ${phase.phase_id}: ${phase.phase_name}`);

    const estimatedTimeline =
      planning.recommended_phases.map((phase) => phase.expected_duration).join(' + ') || 'TBD';

    const scopeItemsCount = scopeMap.phase_scope.reduce(
      (count, phase) => count + phase.items.length,
      0,
    );

    return {
      execution_summary:
        `${understanding.project_category} product focused on ${understanding.target_users.join(', ') || 'target users'}. ` +
        `Plan starts with MVP (${planning.mvp_definition}) and scales to final release (${planning.final_release_definition}). ` +
        `UI direction: ${uiUx.design_direction}.`,
      build_order: phaseNames,
      estimated_timeline: estimatedTimeline,
      quality_gates: [
        'Every scope item has acceptance criteria and test evidence.',
        'Core user journey validated on staging before phase completion.',
        'Security and performance checks pass before release.',
        'Observed logs/metrics are healthy for at least 48 hours post deploy.',
      ],
      go_live_checklist: [
        `Complete all ${scopeItemsCount} scoped development items.`,
        `Confirm tech stack readiness: ${techStack.recommended_stack.frontend}, ${techStack.recommended_stack.backend}, ${techStack.recommended_stack.database}.`,
        'Run regression QA for critical flows.',
        'Finalize monitoring, alerting, backup, and rollback plan.',
        'Publish release notes and operational handover.',
      ],
    };
  }
}
