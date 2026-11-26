import { Elysia } from 'elysia'
import { cekKesehatanDb, ringkasanAnggota, type PoolDb, type RingkasanDb } from './db'

export type ServerDbRepo = {
  cekKesehatanDb: (pool: PoolDb) => Promise<boolean>
  ringkasanAnggota: (pool: PoolDb) => Promise<RingkasanDb>
}

export type ServerDeps = {
  pool: PoolDb
  formBaseUrl: string
  formSecret?: string
  getWaStatus?: () => string
  simulasiJapri?: (nomor: string) => Promise<{ ok: boolean; pesan: string }>
  db?: ServerDbRepo
}

const DEFAULT_DB: ServerDbRepo = {
  cekKesehatanDb,
  ringkasanAnggota,
}

function redirectKeFormulir(baseUrl: string, requestUrl: string): Response {
  const asal = new URL(requestUrl)
  const tujuan = new URL('/formulir', baseUrl)
  asal.searchParams.forEach((nilai, kunci) => {
    tujuan.searchParams.set(kunci, nilai)
  })
  return Response.redirect(tujuan.toString(), 302)
}

async function tanganiSimulasiJapri(
  request: Request,
  deps: ServerDeps,
  set: { status?: number | string },
) {
  if (!deps.formSecret || request.headers.get('x-form-secret') !== deps.formSecret) {
    set.status = 401
    return { ok: false, pesan: 'Unauthorized' }
  }
  if (!deps.simulasiJapri) {
    set.status = 503
    return { ok: false, pesan: 'Fitur simulasi japri belum siap.' }
  }
  const body = (await request.json().catch(() => ({}))) as { nomor?: unknown }
  const nomor = typeof body.nomor === 'string' ? body.nomor.trim() : ''
  if (!nomor) {
    set.status = 400
    return { ok: false, pesan: 'Nomor WA target wajib diisi.' }
  }
  return deps.simulasiJapri(nomor)
}

export function buatServer(deps: ServerDeps) {
  const db = deps.db ?? DEFAULT_DB
  return new Elysia()
    .get('/', ({ request }) => redirectKeFormulir(deps.formBaseUrl, request.url))
    .get('/formulir', ({ request }) => redirectKeFormulir(deps.formBaseUrl, request.url))
    .get('/health', async () => {
      const dbOk = await db.cekKesehatanDb(deps.pool)
      return { ok: dbOk, db: dbOk, wa: deps.getWaStatus ? deps.getWaStatus() : 'disabled' }
    })
    .get('/api/ringkasan', () => db.ringkasanAnggota(deps.pool))
    .post('/api/simulasi-japri', ({ request, set }) => tanganiSimulasiJapri(request, deps, set))
}
