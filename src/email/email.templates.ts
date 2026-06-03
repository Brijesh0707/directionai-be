import * as fs from 'fs';
import * as path from 'path';

const BRAND_NAME = 'Direction AI';
const PRIMARY = '#0B04CF';
const SECONDARY = '#1208E8';
const BACKGROUND = '#F3F1F8';
const TEXT = '#171717';
const MUTED = '#5F5D6B';

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    path: string;
    cid?: string;
  }>;
};

type BaseTemplateInput = {
  title: string;
  preheader: string;
  intro: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

type WelcomeTemplateInput = {
  recipientName?: string | null;
  onboardingUrl: string;
  dashboardUrl: string;
};

type PasswordResetTemplateInput = {
  recipientName?: string | null;
  otp: string;
  expiresInMinutes: number;
  resetUrl: string;
};

type SubscriptionTemplateInput = {
  recipientName?: string | null;
  planName: string;
  projects: number;
  amountInr: number;
  dashboardUrl: string;
  receipt: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveLogoPath = () => {
  const candidates = [
    path.join(process.cwd(), 'src/email/assets/LOGO.png'),
    path.join(process.cwd(), 'src/email/assets/logo.png'),
    path.join(process.cwd(), 'dist/email/assets/LOGO.png'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const logoPath = resolveLogoPath();
const logoAttachment = logoPath
  ? [
      {
        filename: 'LOGO.png',
        path: logoPath,
        cid: 'directionai-logo',
      },
    ]
  : undefined;

const shell = (input: BaseTemplateInput) => {
  const cta = input.ctaLabel && input.ctaUrl
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;">
        <tr>
          <td>
            <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;padding:14px 24px;border-radius:14px;font-weight:700;font-size:14px;">
              ${escapeHtml(input.ctaLabel)}
            </a>
          </td>
        </tr>
      </table>
    `
    : '';

  const footerNote = input.footerNote
    ? `<p style="margin:16px 0 0;color:${MUTED};font-size:13px;line-height:20px;">${escapeHtml(input.footerNote)}</p>`
    : '';

  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:${BACKGROUND};font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BACKGROUND};padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(11,4,207,0.12);">
              <tr>
                <td style="background:linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});padding:24px 28px;color:#fff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="middle" style="width:64px;">
                        ${
                          logoAttachment
                            ? `<img src="cid:directionai-logo" alt="${BRAND_NAME}" width="52" height="52" style="display:block;border-radius:14px;background:#fff;padding:8px;object-fit:cover;" />`
                            : `<div style="width:52px;height:52px;border-radius:14px;background:#fff;color:${PRIMARY};display:flex;align-items:center;justify-content:center;font-weight:800;">DA</div>`
                        }
                      </td>
                      <td valign="middle">
                        <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.8;">${BRAND_NAME}</div>
                        <div style="font-size:20px;font-weight:800;line-height:1.3;">${escapeHtml(input.title)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 28px 24px;">
                  <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${PRIMARY};font-weight:700;margin-bottom:12px;">${escapeHtml(input.preheader)}</div>
                  <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;color:${TEXT};">${escapeHtml(input.intro)}</h1>
                  <div style="font-size:15px;line-height:26px;color:${MUTED};">${input.body}</div>
                  ${cta}
                  ${footerNote}
                </td>
              </tr>
            </table>
            <div style="max-width:640px;margin:14px auto 0;color:${MUTED};font-size:12px;line-height:18px;text-align:center;">
              Built with the Direction AI brand system. If you did not request this email, you can safely ignore it.
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

export const buildWelcomeEmail = (input: WelcomeTemplateInput): EmailTemplate => {
  const name = input.recipientName?.trim() || 'there';
  const subject = 'Welcome to Direction AI';
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">Your Direction AI workspace is ready. You can now turn a rough idea into research, strategy, pitch assets, and execution plans in one place.</p>
    <div style="background:#F8F7FD;border:1px solid #E3DFFC;border-radius:18px;padding:18px 20px;margin:20px 0;">
      <p style="margin:0 0 10px;font-weight:700;color:${TEXT};">What you can do next</p>
      <ul style="margin:0;padding-left:18px;color:${MUTED};">
        <li>Launch your first project from the dashboard</li>
        <li>Run research, marketing, development, and pitch agents</li>
        <li>Generate shareable reports and presentations</li>
      </ul>
    </div>
  `;

  return {
    subject,
    html: shell({
      title: 'Welcome aboard',
      preheader: 'Your workspace is active',
      intro: `Welcome, ${name}.`,
      body,
      ctaLabel: 'Open your onboarding',
      ctaUrl: input.onboardingUrl,
      footerNote: `You can also jump straight to your dashboard anytime: ${input.dashboardUrl}`,
    }),
    text: `Welcome to Direction AI, ${name}. Open your onboarding: ${input.onboardingUrl}`,
    attachments: logoAttachment,
  };
};

export const buildPasswordResetEmail = (input: PasswordResetTemplateInput): EmailTemplate => {
  const name = input.recipientName?.trim() || 'there';
  const subject = 'Your Direction AI password reset code';
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">We received a request to reset the password for your Direction AI account. Use the one-time code below to continue.</p>
    <div style="background:#F8F7FD;border:1px solid #E3DFFC;border-radius:20px;padding:24px;text-align:center;margin:24px 0;">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${PRIMARY};font-weight:800;margin-bottom:10px;">One-time code</div>
      <div style="font-size:36px;letter-spacing:0.26em;font-weight:900;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.otp)}</div>
      <div style="margin-top:10px;color:${MUTED};font-size:13px;">This code expires in ${input.expiresInMinutes} minutes.</div>
    </div>
    <p style="margin:0;">If you did not request this, you can ignore this message. Your account remains secure.</p>
  `;

  return {
    subject,
    html: shell({
      title: 'Password reset',
      preheader: 'Use the OTP to reset your password',
      intro: 'Reset your password',
      body,
      ctaLabel: 'Reset password',
      ctaUrl: input.resetUrl,
      footerNote: `This code expires in ${input.expiresInMinutes} minutes.`,
    }),
    text: `Reset your Direction AI password with this code: ${input.otp}. It expires in ${input.expiresInMinutes} minutes. Open ${input.resetUrl}`,
    attachments: logoAttachment,
  };
};

export const buildSubscriptionEmail = (input: SubscriptionTemplateInput): EmailTemplate => {
  const name = input.recipientName?.trim() || 'there';
  const subject = `${input.planName} is now active on Direction AI`;
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">Your payment was successful and your ${escapeHtml(input.planName)} has been activated.</p>
    <div style="display:grid;gap:12px;margin:24px 0;">
      <div style="background:#F8F7FD;border:1px solid #E3DFFC;border-radius:18px;padding:18px 20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:${PRIMARY};font-weight:800;">Included projects</div>
        <div style="font-size:28px;font-weight:900;color:${TEXT};margin-top:4px;">${input.projects}</div>
      </div>
      <div style="background:#F8F7FD;border:1px solid #E3DFFC;border-radius:18px;padding:18px 20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:${PRIMARY};font-weight:800;">Amount paid</div>
        <div style="font-size:28px;font-weight:900;color:${TEXT};margin-top:4px;">INR ${input.amountInr}</div>
      </div>
    </div>
    <p style="margin:0 0 16px;">Receipt reference: <strong>${escapeHtml(input.receipt)}</strong></p>
    <p style="margin:0;">You can start your next project right away from the dashboard.</p>
  `;

  return {
    subject,
    html: shell({
      title: 'Plan activated',
      preheader: 'Your subscription is live',
      intro: `${input.planName} is active`,
      body,
      ctaLabel: 'Go to dashboard',
      ctaUrl: input.dashboardUrl,
      footerNote: 'Your project credits have been updated in your account.',
    }),
    text: `${input.planName} is active. Projects: ${input.projects}. Amount paid: INR ${input.amountInr}. Receipt: ${input.receipt}. Open ${input.dashboardUrl}`,
    attachments: logoAttachment,
  };
};
