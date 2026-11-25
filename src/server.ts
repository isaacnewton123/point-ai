import { Elysia } from 'elysia'
import { cekKesehatanDb, ringkasanAnggota, type PoolDb, type RingkasanDb } from './db'

export type ServerDbRepo = {
  cekKesehatanDb: (pool: PoolDb) => Promise<boolean>
  ringkasanAnggota: (pool: PoolDb) => Promise<RingkasanDb>
}

export type ServerDeps = {
  pool: PoolDb
  formBaseUrl: string
  getWaStatus?: () => string
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
}
