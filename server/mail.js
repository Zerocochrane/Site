import nodemailer from 'nodemailer';
import { formatExtraValue, monthText } from './calendarLink.js';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailConfigured = () => Boolean(transporter);
const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER;
export const siteUrl = () => (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');

/** Sends an email, or prints it to the console when SMTP is not configured. */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const mail = { from: FROM(), to, subject, text, html, replyTo };
  if (!transporter) {
    console.log(`\n--- Email (SMTP not configured, not sent) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { sent: false };
  }
  await transporter.sendMail(mail);
  return { sent: true };
}

const fmtDate = (iso) => (iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  : 'Data a combinar');
const when = (iso, ym) => (iso ? ` em ${fmtDate(iso)}` : ym ? ` (sem data definida — previsão: ${monthText(ym)})` : ' (sem data definida)');

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ_DISPLAY || 'America/Sao_Paulo' });

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Simple branded HTML email: paragraphs, an optional details box, and an optional button. */
export function layout({ title, paragraphs, details, button, footer }) {
  const rows = details
    ? `<table role="presentation" style="margin:20px 0;border:1px solid #dde2e8;border-collapse:collapse;width:100%">${details
        .map(([k, v]) => `<tr><td style="padding:10px 14px;color:#656565;font-size:13px;text-transform:uppercase;letter-spacing:.06em;width:120px">${escapeHtml(k)}</td><td style="padding:10px 14px;font-size:16px;font-weight:700;font-family:Consolas,Menlo,monospace">${escapeHtml(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const btn = button
    ? `<p style="margin:26px 0"><a href="${button.href}" style="background:#a9c6e2;color:#2a2f36;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;font-size:14px;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f7f7;font-family:Helvetica,Arial,sans-serif;color:#222">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-top:4px solid #a9c6e2;border-radius:12px">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;margin:0 0 18px;color:#2a2f36">${escapeHtml(title)}</h1>
      ${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.55;margin:0 0 12px">${escapeHtml(p)}</p>`).join('')}
      ${rows}${btn}
      ${footer ? `<p style="font-size:13px;color:#656565;margin-top:28px">${escapeHtml(footer)}</p>` : ''}
    </div></body></html>`;
}

export const REFERRAL_TEXT = (inq) =>
  !inq.referral_source
    ? ''
    : inq.referral_source === 'Indicação'
      ? `Indicação de ${inq.referral_name}${inq.referral_instagram ? ` (@${inq.referral_instagram})` : ''}`
      : inq.referral_source;

/** Linhas [rótulo, valor] com tudo o que o cliente preencheu. */
export function inquiryDetails(inq) {
  return [
    ['Categoria', `${inq.event_type} (${inq.category_kind === 'photoshoot' ? 'ensaio' : 'evento'})`],
    ['Data', inq.event_date ? fmtDate(inq.event_date) : inq.estimated_month ? `A definir — previsão: ${monthText(inq.estimated_month)}` : 'A definir'],
    ...(inq.duration_hours ? [['Duração', `${String(inq.duration_hours).replace('.', ',')} hora(s)`]] : []),
    ['Nome', inq.name],
    ['E-mail', inq.email],
    ['Telefone', inq.phone || '-'],
    ...(inq.extra || []).map((f) => [f.label, formatExtraValue(f)]),
    ...(inq.referral_source ? [['Como conheceu', REFERRAL_TEXT(inq)]] : []),
    ...(inq.message ? [['Observações', inq.message]] : []),
  ];
}

const asText = (rows) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');

/** Após o agendamento: confirmação para o cliente + aviso para a fotógrafa. */
export async function sendInquiryEmails(inq) {
  const details = inquiryDetails(inq);
  const firstName = inq.name.split(/\s+/)[0];
  const link = `${siteUrl()}/admin/requests/${inq.id}`;

  const toClient = sendMail({
    to: inq.email,
    replyTo: process.env.PHOTOGRAPHER_EMAIL || undefined,
    subject: `Recebemos seu pedido: ${inq.event_type}${when(inq.event_date, inq.estimated_month)}`,
    text: [
      `Olá, ${firstName}!`,
      '',
      'Recebi o seu pedido de agendamento. Estes são os dados que você enviou:',
      '',
      asText(details),
      '',
      'Entrarei em contato em até 2 dias úteis para confirmar os detalhes.',
      '',
      'Obrigada!',
    ].join('\n'),
    html: layout({
      title: 'Pedido recebido',
      paragraphs: [`Olá, ${firstName}!`, 'Recebi o seu pedido de agendamento. Estes são os dados que você enviou:'],
      details,
      footer: 'Entrarei em contato em até 2 dias úteis para confirmar os detalhes. Obrigada!',
    }),
  });

  const toPhotographer = process.env.PHOTOGRAPHER_EMAIL
    ? sendMail({
        to: process.env.PHOTOGRAPHER_EMAIL,
        replyTo: `"${inq.name.replace(/"/g, '')}" <${inq.email}>`,
        subject: `Novo pedido de agendamento: ${inq.event_type}${when(inq.event_date, inq.estimated_month)}`,
        text: [
          `${inq.name} quer agendar com você.`,
          '',
          asText(details),
          '',
          `Ver e confirmar o pedido: ${link}`,
          '',
          'Responda este e-mail para falar diretamente com a pessoa.',
        ].join('\n'),
        html: layout({
          title: 'Novo pedido de agendamento',
          paragraphs: [`${inq.name} quer agendar com você.`],
          details,
          button: { href: link, label: 'Ver e confirmar o pedido' },
          footer: 'Responda este e-mail para falar diretamente com a pessoa.',
        }),
      })
    : Promise.resolve({ sent: false });

  const results = await Promise.allSettled([toClient, toPhotographer]);
  results.forEach((r) => r.status === 'rejected' && console.error('Falha no e-mail do pedido:', r.reason?.message));
  return results;
}
