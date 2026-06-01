import { Injectable, Logger } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';
import type { AgentUsageContext } from '../types/agent-usage-context.type';

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

// ─── Token budgets per stage ────────────────────────────────────────────────
const TOKEN_BUDGETS = {
  understanding: 2000,
  planningPhases: 3000, // For each individual phase
  planningMetadata: 2000, // For MVP, final release, risks
  uiUx: 2500,
  scopeMap: 8000,
  techStack: 2500,
} as const;

@Injectable()
export class DevelopmentAgent {
  private readonly logger = new Logger(DevelopmentAgent.name);

  constructor(private readonly aiService: AiService) {}

  async runDevelopmentAgentPipeline(
    input: string,
    onProgress?: (stage: string, message: string, progress: number) => void,
    usageContext?: AgentUsageContext,
  ): Promise<FinalDevelopmentPayload> {
    this.logger.log('Running DevelopmentAgent pipeline');
    onProgress?.('understanding', 'Analyzing project understanding', 10);

    const understanding = await this.executePromptWithValidation<ProjectUnderstanding>(
      this.buildUnderstandingPrompt(input),
      'project_understanding',
      ['project_summary', 'problem_statement', 'proposed_solution', 'project_category'],
      TOKEN_BUDGETS.understanding,
      { ...usageContext, callLabel: 'development.projectUnderstanding' },
    );
    onProgress?.('planning', 'Creating delivery and phase plan', 25);

    // Split delivery planning into chunks
    const planning = await this.buildDeliveryPlanningInChunks(input, understanding, usageContext);
    onProgress?.('uiux', 'Generating UI/UX direction', 45);

    const uiUx = await this.executePromptWithValidation<UiUxSuggestion>(
      this.buildUiUxPrompt(input, understanding),
      'ui_ux_suggestion',
      ['design_direction', 'color_palette', 'ui_patterns', 'style_references'],
      TOKEN_BUDGETS.uiUx,
      { ...usageContext, callLabel: 'development.uiUxSuggestion' },
    );
    onProgress?.('scope-map', 'Mapping development scope by phase', 65);

    const scopeMap = await this.buildScopeMapInChunks(input, planning, usageContext);
    onProgress?.('tech-stack', 'Selecting technology stack and tradeoffs', 85);

    const techStack = await this.executePromptWithValidation<TechStackSuggestion>(
      this.buildTechStackPrompt(input, understanding),
      'tech_stack_suggestion',
      ['recommended_stack', 'selection_reasoning', 'tradeoffs', 'bias_check_note'],
      TOKEN_BUDGETS.techStack,
      { ...usageContext, callLabel: 'development.techStack' },
    );

    const finalSummary = this.mergeFinalSummary(
      understanding,
      planning,
      uiUx,
      scopeMap,
      techStack,
    );
    onProgress?.('done', 'Development roadmap completed', 100);

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

  // ─── Core AI call ──────────────────────────────────────────────────────────

  private async askAi(
    prompt: string,
    maxTokens: number,
    usageContext?: AgentUsageContext,
  ): Promise<string> {
    const model =
      process.env.DEVELOPMENT_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'deepseek.v3-v1:0';

    const result = await this.aiService.generateWithBedrock(
      prompt,
      model,
      {
        inferenceConfig: {
          temperature: 0.2,
          maxTokens,
        },
      },
      usageContext,
    );
    return result.text;
  }

  // ─── JSON helpers ──────────────────────────────────────────────────────────

  private parseJson<T>(raw: string, sectionName: string): T {
    let cleaned = raw.trim();

    // Remove markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    // Pull out the outermost { … } block
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `[${sectionName}] No JSON object found in model output. ` +
          `First 200 chars: ${cleaned.slice(0, 200)}`,
      );
    }
    cleaned = jsonMatch[0];

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const repaired = this.repairTruncatedJson(cleaned);
      try {
        const result = JSON.parse(repaired) as T;
        this.logger.warn(
          `[${sectionName}] JSON was truncated and auto-repaired — ` +
            'check model token budget if this happens frequently.',
        );
        return result;
      } catch (repairErr) {
        throw new Error(
          `[${sectionName}] JSON parse failed after repair attempt. ` +
            `Original error: ${(repairErr as Error).message}. ` +
            `Snippet: ${cleaned.slice(0, 300)}`,
        );
      }
    }
  }

  private repairTruncatedJson(input: string): string {
    let s = input;

    // Remove trailing comma
    s = s.replace(/,\s*$/, '');

    // Close unterminated string
    const quoteCount = (s.match(/(?<!\\)"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      s += '"';
    }

    // Close unclosed brackets and braces
    const stack: string[] = [];
    let inString = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
        inString = !inString;
      }
      if (!inString) {
        if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
      }
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      s += stack[i] === '{' ? '}' : ']';
    }

    return s;
  }

  private validateRequiredKeys(value: unknown, requiredKeys: string[], sectionName: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`[${sectionName}] Response must be a JSON object, got: ${typeof value}`);
    }
    for (const key of requiredKeys) {
      if (!(key in (value as Record<string, unknown>))) {
        throw new Error(`[${sectionName}] Missing required key: "${key}"`);
      }
    }
  }

  private async executePromptWithValidation<T>(
    prompt: string,
    sectionName: string,
    requiredKeys: string[],
    maxTokens: number,
    usageContext?: AgentUsageContext,
  ): Promise<T> {
    const aiResponse = await this.askAi(prompt, maxTokens, usageContext);
    const parsed = this.parseJson<T>(aiResponse, sectionName);
    this.validateRequiredKeys(parsed, requiredKeys, sectionName);
    this.logger.log(`Validated section: ${sectionName}`);
    return parsed;
  }

  // ─── Delivery planning: split by phases ────────────────────────────────────

  /**
   * Split delivery planning into separate AI calls:
   * 1. Generate all phases (names, goals, durations) - lightweight
   * 2. Generate deliverables for each phase individually
   * 3. Generate MVP definition, final release, and risks
   */
  private async buildDeliveryPlanningInChunks(
    input: string,
    understanding: ProjectUnderstanding,
    usageContext?: AgentUsageContext,
  ): Promise<DeliveryPlanning> {
    // Step 1: Generate phase structure (no deliverables)
    type PhaseStructure = {
      phases: Array<{
        phase_id: number;
        phase_name: string;
        phase_goal: string;
        expected_duration: string;
      }>;
    };

    const phaseStructure = await this.executePromptWithValidation<PhaseStructure>(
      this.buildPhaseStructurePrompt(input, understanding),
      'phase_structure',
      ['phases'],
      TOKEN_BUDGETS.planningPhases,
      { ...usageContext, callLabel: 'development.planning.phases' },
    );

    // Step 2: Generate deliverables for each phase
    const phasesWithDeliverables: DeliveryPlanning['recommended_phases'] = [];

    for (const phase of phaseStructure.phases) {
      this.logger.log(`Building deliverables for phase ${phase.phase_id}: ${phase.phase_name}`);

      type PhaseDeliverables = {
        key_deliverables: string[];
      };

      const deliverables = await this.executePromptWithValidation<PhaseDeliverables>(
        this.buildPhaseDeliverablesPrompt(input, understanding, phase),
        `phase_deliverables_${phase.phase_id}`,
        ['key_deliverables'],
        TOKEN_BUDGETS.planningPhases,
        { ...usageContext, callLabel: `development.planning.deliverables.phase${phase.phase_id}` },
      );

      phasesWithDeliverables.push({
        ...phase,
        key_deliverables: deliverables.key_deliverables,
      });
    }

    // Step 3: Generate metadata (MVP, final release, risks)
    type PlanningMetadata = {
      mvp_definition: string;
      final_release_definition: string;
      risks_and_dependencies: string[];
    };

    const metadata = await this.executePromptWithValidation<PlanningMetadata>(
      this.buildPlanningMetadataPrompt(input, understanding, phasesWithDeliverables),
      'planning_metadata',
      ['mvp_definition', 'final_release_definition', 'risks_and_dependencies'],
      TOKEN_BUDGETS.planningMetadata,
      { ...usageContext, callLabel: 'development.planning.metadata' },
    );

    return {
      recommended_phases: phasesWithDeliverables,
      mvp_definition: metadata.mvp_definition,
      final_release_definition: metadata.final_release_definition,
      risks_and_dependencies: metadata.risks_and_dependencies,
    };
  }

  // ─── Scope map: one call per phase ────────────────────────────────────────

  private async buildScopeMapInChunks(
    input: string,
    planning: DeliveryPlanning,
    usageContext?: AgentUsageContext,
  ): Promise<DevelopmentScopeMap> {
    const phaseScopes: DevelopmentScopeMap['phase_scope'] = [];

    for (const phase of planning.recommended_phases) {
      this.logger.log(`Building scope for phase ${phase.phase_id}: ${phase.phase_name}`);

      type SinglePhaseScope = { phase_scope: DevelopmentScopeMap['phase_scope'] };

      const result = await this.executePromptWithValidation<SinglePhaseScope>(
        this.buildSinglePhaseScopePrompt(input, phase),
        `development_scope_map.phase_${phase.phase_id}`,
        ['phase_scope'],
        TOKEN_BUDGETS.scopeMap,
        { ...usageContext, callLabel: `development.scopeMap.phase${phase.phase_id}` },
      );

      const normalised = result.phase_scope.map((ps) => ({
        ...ps,
        phase_id: phase.phase_id,
      }));
      phaseScopes.push(...normalised);
    }

    return { phase_scope: phaseScopes };
  }

  // ─── Prompt builders ───────────────────────────────────────────────────────

  private buildUnderstandingPrompt(input: string): string {
    return `You are Development Sub-Agent 1: Project Understanding.

STRICT OUTPUT RULES:
- Return ONLY a single valid JSON object. No markdown, no commentary, no extra keys.
- Every string value must be concise (≤ 2 sentences).
- Arrays must have 3–6 items each.

Output schema (copy exactly, fill in values):
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

  private buildPhaseStructurePrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 2a: Phase Structure Planning.

Generate 3-5 development phases for this project. Return ONLY valid JSON.

Output schema:
{
  "phases": [
    {
      "phase_id": 1,
      "phase_name": "string (short, descriptive name)",
      "phase_goal": "string (one sentence describing what this phase achieves)",
      "expected_duration": "string (e.g., '2-3 weeks', '1 month')"
    }
  ]
}

User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private buildPhaseDeliverablesPrompt(
    input: string,
    understanding: ProjectUnderstanding,
    phase: { phase_id: number; phase_name: string; phase_goal: string; expected_duration: string },
  ): string {
    return `You are Development Sub-Agent 2b: Phase Deliverables Generator.

For Phase ${phase.phase_id}: "${phase.phase_name}"
Goal: ${phase.phase_goal}

Generate 3-6 specific, actionable deliverables for this phase.
Each deliverable must be a clear, measurable outcome.

Return ONLY valid JSON:
{
  "key_deliverables": ["deliverable 1", "deliverable 2", "..."]
}

User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private buildPlanningMetadataPrompt(
    input: string,
    understanding: ProjectUnderstanding,
    phases: DeliveryPlanning['recommended_phases'],
  ): string {
    const phasesSummary = phases
      .map((p) => `Phase ${p.phase_id}: ${p.phase_name} - ${p.phase_goal}`)
      .join('\n');

    return `You are Development Sub-Agent 2c: Planning Metadata Generator.

Based on these phases:
${phasesSummary}

Generate:
1. MVP definition - What is the minimum viable product? Which phases constitute the MVP?
2. Final release definition - What does the complete product look like?
3. Risks and dependencies - List 4-8 potential risks or dependencies

Return ONLY valid JSON:
{
  "mvp_definition": "string (2-3 sentences)",
  "final_release_definition": "string (2-3 sentences)",
  "risks_and_dependencies": ["risk 1", "risk 2", "..."]
}

User idea: ${input}
Project understanding: ${JSON.stringify(understanding)}`;
  }

  private buildUiUxPrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 3: UI/UX Design Suggestions.

STRICT OUTPUT RULES:
- Return ONLY a single valid JSON object. No markdown, no commentary, no extra keys.
- color_palette must have exactly 5 tokens: primary, secondary, accent, background, text.
- ui_patterns must have 4–6 items.
- ux_principles must have 3–5 items.
- style_references must have 2–4 items.

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

  private buildSinglePhaseScopePrompt(
    input: string,
    phase: DeliveryPlanning['recommended_phases'][number],
  ): string {
    return `You are Development Sub-Agent 4: Phase-wise Scope Mapper.
You are scoping ONLY Phase ${phase.phase_id}: "${phase.phase_name}".

Phase goal: ${phase.phase_goal}
Key deliverables: ${phase.key_deliverables.join(', ')}

STRICT OUTPUT RULES:
- Return ONLY a single valid JSON object. No markdown, no commentary, no extra keys.
- phase_scope must be an array containing exactly ONE object for phase_id ${phase.phase_id}.
- items MUST contain between 12 and 18 scope entries — do not produce fewer than 12.
- Cover all scope_type values: feature, infra, qa, security, ops.
- development_id format: "DEV-${phase.phase_id}-XXX" where XXX is zero-padded (e.g., DEV-${phase.phase_id}-001).
- acceptance_criteria must have 2–4 items per scope entry.

Output schema:
{
  "phase_scope": [
    {
      "phase_id": ${phase.phase_id},
      "items": [
        {
          "development_id": "DEV-${phase.phase_id}-001",
          "title": "string",
          "description": "string",
          "scope_type": "feature|infra|qa|security|ops",
          "acceptance_criteria": ["string"]
        }
      ]
    }
  ]
}

User idea: ${input}`;
  }

  private buildTechStackPrompt(input: string, understanding: ProjectUnderstanding): string {
    return `You are Development Sub-Agent 5: Neutral Tech Stack Advisor.

STRICT OUTPUT RULES:
- Return ONLY a single valid JSON object. No markdown, no commentary, no extra keys.
- Be unbiased: evaluate options by requirements, scale, cost, team skill, and maintainability.
- selection_reasoning must have 4–6 items.
- tradeoffs must have 3–5 items.
- alternatives arrays must have 2–3 items each.

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

  // ─── Final summary (pure merge, no AI call) ────────────────────────────────

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