import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { MarketingAgent } from './Marketing/marketing.agent';
import { PptAgentService } from './PPT/ppt.agent';
import { ResearchAgentService } from './Research/research';

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: PptAgentService,
          useValue: {
            runPptAgentPipeline: jest.fn(),
          },
        },
        {
          provide: ResearchAgentService,
          useValue: {
            runResearchAgentPipeline: jest.fn(),
          },
        },
        {
          provide: MarketingAgent,
          useValue: {
            runMarketingAgentPipeline: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
