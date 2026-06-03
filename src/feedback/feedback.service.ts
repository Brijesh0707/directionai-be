import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createBugReport(userId: string, dto: CreateBugReportDto) {
    const bugReport = await this.prisma.bugReport.create({
      data: {
        userId,
        message: dto.message,
        attachmentUrl: dto.attachmentUrl,
        status: 'open',
      },
    });

    return {
      id: bugReport.id,
      message: bugReport.message,
      status: bugReport.status,
      createdAt: bugReport.createdAt,
    };
  }

  async listBugReports(userId: string) {
    return this.prisma.bugReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
