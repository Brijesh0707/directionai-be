import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { buildPasswordResetEmail, buildSubscriptionEmail, buildWelcomeEmail } from './email.templates';

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    path: string;
    cid?: string;
  }>;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from = process.env.SMTP_FROM ?? `Direction AI <${process.env.SMTP_USER ?? 'no-reply@directionai.local'}>`;
  private readonly frontendUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'http://localhost:3010';

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP is not configured. Email delivery will be logged only.');
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE ?? 'false') === 'true',
      auth: {
        user,
        pass,
      },
    });
  }

  async sendWelcomeEmail(input: { email: string; name?: string | null }) {
    return this.sendMail({
      to: input.email,
      ...buildWelcomeEmail({
        recipientName: input.name,
        onboardingUrl: `${this.frontendUrl}/onboard`,
        dashboardUrl: `${this.frontendUrl}/dashboard`,
      }),
    });
  }

  async sendPasswordResetOtpEmail(input: {
    email: string;
    name?: string | null;
    otp: string;
    expiresInMinutes: number;
  }) {
    return this.sendMail({
      to: input.email,
      ...buildPasswordResetEmail({
        recipientName: input.name,
        otp: input.otp,
        expiresInMinutes: input.expiresInMinutes,
        resetUrl: `${this.frontendUrl}/forgot-password`,
      }),
    });
  }

  async sendSubscriptionActivatedEmail(input: {
    email: string;
    name?: string | null;
    planName: string;
    projects: number;
    amountInr: number;
    receipt: string;
  }) {
    return this.sendMail({
      to: input.email,
      ...buildSubscriptionEmail({
        recipientName: input.name,
        planName: input.planName,
        projects: input.projects,
        amountInr: input.amountInr,
        dashboardUrl: `${this.frontendUrl}/dashboard`,
        receipt: input.receipt,
      }),
    });
  }

  private async sendMail(payload: MailPayload) {
    if (!this.transporter) {
      this.logger.log(`[email:disabled] to=${payload.to} subject=${payload.subject}`);
      return { sent: false };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
      });

      this.logger.log(`Email sent to ${payload.to} (${result.messageId})`);
      return { sent: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error(`Failed to send email to ${payload.to}`, error instanceof Error ? error.stack : undefined);
      return { sent: false };
    }
  }
}
