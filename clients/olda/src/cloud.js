class FitCloudClient {
  constructor(validate, storage, fetcher = (...args) => fetch(...args)) { this.validate = validate; this.storage = storage; this.fetcher = (...args) => fetcher(...args); this.key = 'itfit-olda-cloud-cache-v1'; }
  cached() { try { const value = JSON.parse(this.storage.getItem(this.key)); return value && ['coach', 'viewer'].includes(value.role) ? { data: this.validate(value.data), role: value.role } : null; } catch { return null; } }
  async request(method = 'GET', data, baseRevision) {
    const response = await this.fetcher('/api/board', { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', ...(method === 'PUT' ? { 'Content-Type': 'application/json', 'X-ITFIT-Write': '1' } : {}) }, ...(method === 'PUT' ? { body: JSON.stringify({ data, baseRevision }) } : {}), signal: AbortSignal.timeout(15000) });
    let body;
    try { body = await response.json(); } catch { throw Object.assign(new Error('Server neposlal údaje nástěnky. Zkus obnovit přihlášení.'), { status: response.status }); }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) { try { this.storage.removeItem(this.key); } catch {} }
      throw Object.assign(new Error(body.error || 'Údaje se nepodařilo uložit.'), { status: response.status, code: body.code });
    }
    if (!['coach', 'viewer'].includes(body.role)) throw new Error('Server nepotvrdil tvoje oprávnění.');
    const result = { data: this.validate(body.data), role: body.role };
    try { this.storage.setItem(this.key, JSON.stringify(result)); } catch {}
    return result;
  }
  load() { return this.request(); }
  save(data, baseRevision) { return this.request('PUT', data, baseRevision); }
  async authenticate(key) {
    const response = await this.fetcher('/api/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-ITFIT-Write':'1'},body:JSON.stringify({key}),signal:AbortSignal.timeout(15000)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Přihlášení se nepodařilo.');return value;
  }
  async logout() {
    const response=await this.fetcher('/api/logout',{method:'POST',credentials:'same-origin',headers:{'X-ITFIT-Write':'1'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Odhlášení se nepodařilo.');try{this.storage.removeItem(this.key);}catch{}
  }
}
