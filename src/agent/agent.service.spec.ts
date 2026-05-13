import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { PptAgentService } from './PPT/ppt.agent';

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
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
