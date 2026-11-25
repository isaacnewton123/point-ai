import { createHmac, timingSafeEqual } from 'node:crypto'

type PayloadToken = {
  n: string
  e: number
}

function tandaTangan(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function buatTokenFormulir(
  nomor: string,
  secret: string,
  ttlDetik = 60 * 60 * 24 * 30,
  sekarangMs = Date.now(),
): string {
  const payload: PayloadToken = {
    n: nomor,
    e: Math.floor(sekarangMs / 1000) + ttlDetik,
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = tandaTangan(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

export function verifikasiTokenFormulir(
  token: string,
  secret: string,
  sekarangMs = Date.now(),
): { nomor: string } | null {
  const bagian = token.trim().split('.')
  if (bagian.length !== 2) return null
  const [payloadB64, sig] = bagian
  if (!payloadB64 || !sig) return null

  const diharapkan = tandaTangan(payloadB64, secret)
  const bufSig = Buffer.from(sig, 'utf8')
  const bufDiharapkan = Buffer.from(diharapkan, 'utf8')
  if (bufSig.length !== bufDiharapkan.length) return null
  if (!timingSafeEqual(bufSig, bufDiharapkan)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<PayloadToken>
    if (typeof parsed.n !== 'string' || !parsed.n || typeof parsed.e !== 'number') return null
    if (parsed.e < Math.floor(sekarangMs / 1000)) return null
    return { nomor: parsed.n }
  } catch {
    return null
  }
}

export function buatLinkFormulir(baseUrl: string, secret: string, nomor?: string): string {
  const dasar = baseUrl.replace(/\/+$/, '')
  if (!nomor) return `${dasar}/formulir`
  const token = buatTokenFormulir(nomor, secret)
  return `${dasar}/formulir?t=${encodeURIComponent(token)}`
}
