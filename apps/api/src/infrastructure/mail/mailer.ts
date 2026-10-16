import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly action?: { readonly label: string; readonly url: string };
  readonly footnote?: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Todo texto variable se escapa: un nombre de proyecto no debe inyectar HTML en un correo. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Correo transaccional. En desarrollo va a Mailpit (http://localhost:8025).
 * Los enlaces llevan el token en el fragmento (#), que el navegador no envía al
 * servidor ni incluye en la cabecera Referer.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor() {
    const env = loadEnv();
    this.from = env.MAIL_FROM;
    this.transport = createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: this.renderText(message),
        html: this.renderHtml(message),
      });
    } catch (error: unknown) {
      // No se registra el destinatario ni el contenido (RS-052).
      this.logger.error(`No se pudo enviar un correo: ${error instanceof Error ? error.name : 'desconocido'}`);
    }
  }

  private renderText(m: MailMessage): string {
    const action = m.action ? `\n\n${m.action.label}: ${m.action.url}` : '';
    const foot = m.footnote ? `\n\n${m.footnote}` : '';
    return `${m.heading}\n\n${m.paragraphs.join('\n\n')}${action}${foot}\n\n— SecurTex`;
  }

  private renderHtml(m: MailMessage): string {
    const paragraphs = m.paragraphs
      .map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#3d3a33">${escapeHtml(p)}</p>`)
      .join('');
    const action = m.action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(m.action.url)}" style="background:#1f3fbf;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(m.action.label)}</a></p>`
      : '';
    const foot = m.footnote
      ? `<p style="margin:24px 0 0;font-size:12px;color:#8a8579">${escapeHtml(m.footnote)}</p>`
      : '';
    return `<!doctype html><html><body style="background:#f4f1ea;padding:32px;font-family:Georgia,serif">
<div style="max-width:520px;margin:auto;background:#fffdf8;border:1px solid #e7e1d4;border-radius:16px;padding:32px">
<p style="margin:0 0 20px;font:600 13px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#1f3fbf">SecurTex</p>
<h1 style="margin:0 0 16px;font-size:24px;color:#1b1a17">${escapeHtml(m.heading)}</h1>
${paragraphs}${action}${foot}</div></body></html>`;
  }
}
