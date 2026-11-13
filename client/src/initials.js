/** Iniciais do nome: "Ana Lima" → "AL", "Débora de Souza Gostini" → "DG", "Ana" → "A". */
export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const significant = words.filter((w) => !/^(d[aeo]s?|e)$/i.test(w));
  const list = significant.length ? significant : words;
  if (!list.length) return '';
  const first = list[0][0];
  const last = list.length > 1 ? list[list.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('pt-BR');
}
