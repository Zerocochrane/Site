const store = (key) => ({
  get: () => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(key, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
});

export const auth = store('portfolio_admin_token');        // photographer
export const clientAuth = store('portfolio_client_token'); // client area

export class ApiError extends Error {
  constructor(message, status, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function makeApi(tokens) {
  return async function call(path, { method = 'GET', body } = {}) {
    const headers = {};
    const token = tokens.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) tokens.clear();
      throw new ApiError(data.error || 'Algo deu errado.', res.status, data.errors, data.code);
    }
    return data;
  };
}

export const api = makeApi(auth);
export const clientApi = makeApi(clientAuth);

/**
 * Uploads many (large) photos to a client area in small batches, with overall progress.
 * Resolves to { created: [...], failed: [names] }.
 */
export async function uploadClientPhotos(clientId, kind, files, onProgress) {
  const list = [...files];
  const total = list.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0;
  const created = [], failed = [];
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const batchBytes = batch.reduce((n, f) => n + f.size, 0);
    try {
      const res = await new Promise((resolve, reject) => {
        const form = new FormData();
        batch.forEach((f) => form.append('photos', f));
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/admin/clients/${clientId}/photos?kind=${kind}`);
        const token = auth.get();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.((done + e.loaded * (batchBytes / e.total)) / total, i, list.length);
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else if (data.created || data.failed) resolve(data);
          else reject(new ApiError(data.error || 'Falha no envio.', xhr.status));
        };
        xhr.onerror = () => reject(new ApiError('Erro de conexão durante o envio.', 0));
        xhr.send(form);
      });
      created.push(...(res.created || []));
      failed.push(...(res.failed || []));
    } catch (err) {
      if (err.status === 401) throw err;
      failed.push(...batch.map((f) => f.name));
    }
    done += batchBytes;
    onProgress?.(done / total, Math.min(i + 6, list.length), list.length);
  }
  return { created, failed };
}

// Upload with progress (fetch has no upload progress, so XHR here)
export function uploadPhotos(subgroupId, files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    [...files].forEach((f) => form.append('photos', f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/subgroups/${subgroupId}/photos`);
    const token = auth.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data.error || 'Falha no envio.', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Erro de conexão durante o envio.', 0));
    xhr.send(form);
  });
}

// Date helpers (local dates, YYYY-MM-DD)
export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => toISO(new Date());
export const prettyDate = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', opts);

/** Baixa um arquivo protegido do painel (envia o token) e salva com o nome vindo do servidor. */
export async function downloadFile(path, fallbackName = 'arquivo') {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${auth.get()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Não foi possível baixar o arquivo.', res.status);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Envia um único arquivo (multipart) para uma rota do painel. */
export async function uploadFile(path, field, file) {
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${auth.get()}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Falha no envio.', res.status);
  return data;
}

export const brl = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
