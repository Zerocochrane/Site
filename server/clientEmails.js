// Os e-mails enviados aos clientes da área de seleção de fotos.
import { sendMail, layout, siteUrl, fmtDateTime } from './mail.js';
import { getSettings } from './db.js';
import { RETENTION_MONTHS } from './clientsDb.js';

const loginUrl = () => `${siteUrl()}/cliente`;
const studio = () => getSettings().name || 'Sua fotógrafa';
const replyTo = () => process.env.PHOTOGRAPHER_EMAIL || undefined;
const first = (name) => String(name).trim().split(/\s+/)[0];

/**
 * Fotos prontas para escolher (ou nova senha). `password` vazio = o cliente já tem senha
 * (recebida com o contrato), então o e-mail não traz senha nenhuma.
 */
export function sendAccessEmail(client, password, { reset = false } = {}) {
  const url = loginUrl();
  const intro = reset
    ? `Aqui está uma nova senha para a sua área do cliente.`
    : `Suas fotos estão prontas para você escolher! Entre com os dados abaixo e escolha as suas ${client.selection_limit} favoritas.`;
  const samePw = password ? [] : ['Use a mesma senha que você recebeu junto com o contrato.'];
  const deadline = client.access_sent_at ? `Confirme a sua seleção até ${fmtDateTime(client.expires_at)}. Depois disso, o seu acesso será encerrado.` : '';
  const showDeadline = !client.confirmed_at && deadline;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: reset ? `${studio()} — sua nova senha` : `${studio()} — escolha suas fotos`,
    text: [`Olá, ${first(client.name)}!`, '', intro, ...samePw, '', `Login: ${client.username}`, ...(password ? [`Senha: ${password}`] : []), `Link:  ${url}`, '', ...(showDeadline ? [deadline, ''] : []), `— ${studio()}`].join('\n'),
    html: layout({
      title: reset ? 'Sua nova senha' : 'Escolha suas fotos',
      paragraphs: [`Olá, ${first(client.name)}!`, intro, ...samePw],
      details: [['Login', client.username], ...(password ? [['Senha', password]] : [])],
      button: { href: url, label: reset ? 'Abrir a área do cliente' : 'Abrir minhas fotos' },
      footer: showDeadline ? `${deadline}${password ? '' : ' Esqueceu a senha? É só responder este e-mail.'}` : undefined,
    }),
  });
}

/** Contrato disponível para assinatura digital — é aqui que o cliente recebe a senha pela primeira vez. */
export function sendContractEmail(client, password, { reset = false } = {}) {
  const url = loginUrl();
  const intro = reset
    ? 'Aqui está uma nova senha para a sua área do cliente, onde o seu contrato está esperando a sua assinatura digital.'
    : `O seu contrato com ${studio()} está disponível para ser assinado digitalmente. Entre na área do cliente com os dados abaixo, leia o contrato e assine — leva só um minuto.`;
  const after = 'Depois que você assinar, a fotógrafa assina também e o contrato assinado por ambas as partes fica disponível para download na mesma página.';
  const deadline = `Assine até ${fmtDateTime(client.sign_deadline)}. Depois disso, o acesso é encerrado e será preciso pedir um novo prazo.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: reset ? `${studio()} — sua nova senha` : `${studio()} — seu contrato está pronto para assinar`,
    text: [`Olá, ${first(client.name)}!`, '', intro, '', `Login: ${client.username}`, `Senha: ${password}`, `Link:  ${url}`, '', after, '', deadline, '', `— ${studio()}`].join('\n'),
    html: layout({
      title: reset ? 'Sua nova senha' : 'Seu contrato está pronto para assinar',
      paragraphs: [`Olá, ${first(client.name)}!`, intro, after],
      details: [['Login', client.username], ['Senha', password]],
      button: { href: url, label: 'Ler e assinar o contrato' },
      footer: `${deadline} Guarde esta senha: ela também dá acesso às suas fotos depois.`,
    }),
  });
}

export function sendSignReminderEmail(client) {
  const url = loginUrl();
  const when = fmtDateTime(client.sign_deadline);
  const text = `O seu contrato ainda está esperando a sua assinatura. O prazo vai até ${when} — depois disso o acesso é encerrado.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: 'Lembrete: faltam 2 dias para assinar o seu contrato',
    text: [`Olá, ${first(client.name)}!`, '', text, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', `— ${studio()}`].join('\n'),
    html: layout({
      title: 'Faltam 2 dias para assinar',
      paragraphs: [`Olá, ${first(client.name)}!`, text],
      details: [['Login', client.username], ['Prazo', when]],
      button: { href: url, label: 'Assinar o contrato' },
      footer: 'Esqueceu a senha? É só responder este e-mail.',
    }),
  });
}

export function sendSignExtendedEmail(client) {
  const url = loginUrl();
  const text = `O prazo para assinar o seu contrato foi estendido até ${fmtDateTime(client.sign_deadline)}.`;
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: `${studio()} — mais tempo para assinar o contrato`,
    text: [`Olá, ${first(client.name)}!`, '', text, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', `— ${studio()}`].join('\n'),
    html: layout({ title: 'Mais tempo para assinar', paragraphs: [`Olá, ${first(client.name)}!`, text], details: [['Login', client.username]], button: { href: url, label: 'Assinar o contrato' } }),
  });
}

/** Avisa a fotógrafa que o cliente assinou (falta a assinatura dela). */
export function sendClientSignedToPhotographer(client) {
  if (!process.env.PHOTOGRAPHER_EMAIL) return Promise.resolve({ sent: false });
  const link = `${siteUrl()}/admin/clients/${client.id}`;
  return sendMail({
    to: process.env.PHOTOGRAPHER_EMAIL,
    replyTo: client.email,
    subject: `${client.name} assinou o contrato — falta a sua assinatura`,
    text: [`${client.name} assinou o contrato em ${fmtDateTime(client.client_signed_at)}.`, '', `Código da assinatura: ${client.client_sign_hash}`, '', `Assine também no painel: ${link}`].join('\n'),
  });
}

/** Contrato assinado pelas duas partes. */
export function sendContractCompleteEmail(client) {
  const url = loginUrl();
  const text = `O seu contrato foi assinado por você e por ${studio()}. A cópia assinada por ambas as partes, com os códigos de verificação das duas assinaturas, está disponível para download na área do cliente.`;
  const next = 'O próximo passo são as fotos: você vai receber um e-mail quando elas estiverem prontas para você escolher.';
  return sendMail({
    to: client.email,
    replyTo: replyTo(),
    subject: `${studio()} — contrato assinado por ambas as partes`,
    text: [`Olá, ${first(client.name)}!`, '', text, '', next, '', `Acesse aqui: ${url}`, `Login: ${client.username}`, '', `Código do contrato: ${client.job_hash}`, '', `— ${studio()}`].join('\n'),
    html: layout({
      title: 'Contrato assinado',
      paragraphs: [`Olá, ${first(client.name)}!`, text, next],
      details: [['Login', client.username]],
      button: { href: url, label: 'Baixar o contrato assinado' },
      footer: `Código do contrato: ${client.job_hash}`,
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
