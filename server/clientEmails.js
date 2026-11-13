// Os e-mails enviados aos clientes da área de seleção de fotos.
import { sendMail, layout, siteUrl, fmtDateTime } from './mail.js';
import { getSettings } from './db.js';
import { RETENTION_MONTHS } from './clientsDb.js';

const loginUrl = () => `${siteUrl()}/cliente`;
const studio = () => getSettings().name || 'Sua fotógrafa';
const replyTo = () => process.env.PHOTOGRAPHER_EMAIL || undefined;
const first = (name) => String(name).trim().split(/\s+/)[0];

export function sendAccessEmail(client, password, { reset = false } = {}) {
  const url = loginUrl();
  const intro = reset
    ? `Aqui está uma nova senha para a sua área de seleção de fotos.`
    : `Suas fotos estão prontas para você escolher! Entre com os dados abaixo e escolha as suas ${client.selection_limit} favoritas.`;
  const deadline = `Confirme a sua seleção até ${fmtDateTime(client.expires_at)}. Depois disso, o seu acesso será encerrado.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: reset ? `${studio()} — sua nova senha` : `${studio()} — escolha suas fotos`,
    text: [`Olá, ${first(client.name)}!`, '', intro, '', `Login: ${client.username}`, `Senha: ${password}`, `Link:  ${url}`, '', ...(client.confirmed_at ? [] : [deadline, '']), `— ${studio()}`].join('\n'),
    html: layout({
      title: reset ? 'Sua nova senha' : 'Escolha suas fotos',
      paragraphs: [`Olá, ${first(client.name)}!`, intro],
      details: [['Login', client.username], ['Senha', password]],
      button: { href: url, label: 'Abrir minhas fotos' },
      footer: client.confirmed_at ? undefined : deadline,
    }),
  });
}

export function sendReminderEmail(client) {
  const url = loginUrl();
  const when = fmtDateTime(client.expires_at);
  const text = `Você ainda não confirmou a sua seleção de fotos. O prazo vai até ${when} — depois disso o seu acesso será bloqueado e você não poderá mais escolher as fotos.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: `Lembrete: faltam 2 dias para escolher suas fotos`,
    text: [`Olá, ${first(client.name)}!`, '', text, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', `— ${studio()}`].join('\n'),
    html: layout({
      title: 'Faltam 2 dias',
      paragraphs: [`Olá, ${first(client.name)}!`, text],
      details: [['Login', client.username], ['Prazo', when]],
      button: { href: url, label: 'Escolher minhas fotos agora' },
      footer: 'Esqueceu a senha? É só responder este e-mail.',
    }),
  });
}

export function sendExtendedEmail(client) {
  const url = loginUrl();
  const when = fmtDateTime(client.expires_at);
  const text = `Boa notícia: o seu prazo para acessar as fotos foi estendido até ${when}.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: `${studio()} — mais tempo para as suas fotos`,
    text: [`Olá, ${first(client.name)}!`, '', text, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', `— ${studio()}`].join('\n'),
    html: layout({ title: 'Mais tempo', paragraphs: [`Olá, ${first(client.name)}!`, text], details: [['Login', client.username]], button: { href: url, label: 'Abrir minhas fotos' } }),
  });
}

export function sendDoneEmail(client, count) {
  const url = loginUrl();
  const text = `${count === 1 ? 'Sua foto editada está pronta' : `Suas ${count} fotos editadas estão prontas`}! Entre para vê-las e baixar todas de uma vez em um arquivo .zip.`;
  const keep = `Guarde-as em um lugar seguro: depois do primeiro download, elas ficam disponíveis aqui por ${RETENTION_MONTHS} meses e então são excluídas.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: `${studio()} — suas fotos estão prontas`,
    text: [`Olá, ${first(client.name)}!`, '', text, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', keep, '', `— ${studio()}`].join('\n'),
    html: layout({
      title: 'Suas fotos estão prontas',
      paragraphs: [`Olá, ${first(client.name)}!`, text],
      details: [['Login', client.username]],
      button: { href: url, label: 'Ver minhas fotos' },
      footer: `${keep} Esqueceu a senha? É só responder este e-mail.`,
    }),
  });
}

/** Avisa a fotógrafa que um cliente confirmou, com a lista de arquivos escolhidos. */
export function sendSelectionToPhotographer(client, names) {
  if (!process.env.PHOTOGRAPHER_EMAIL) return Promise.resolve({ sent: false });
  const text = [`${client.name} (${client.username}) confirmou a seleção de ${names.length} foto${names.length === 1 ? '' : 's'}:`, '', ...names, '', `Abra o cliente na sua área administrativa: ${siteUrl()}/admin/clients/${client.id}`].join('\n');
  return sendMail({ to: process.env.PHOTOGRAPHER_EMAIL, replyTo: client.email, subject: `${client.name} escolheu ${names.length} foto${names.length === 1 ? '' : 's'}`, text });
}
