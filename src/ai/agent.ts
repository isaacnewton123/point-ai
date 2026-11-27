import { ambilRiwayatChat, type PoolDb } from '../db'
import { LABEL_KOLOM, type KolomWajib } from '../validasi'
import { ATURAN_FORMAT_WA, formatKeWhatsApp, PERSONA_POINT } from './format-wa'
import { jalankanTool, TOOL_DEFINITIONS, type DbRepo, type IngatkanGrupInput, type ToolContext } from './tools'

const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions'

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type AiDeps = {
  pool: PoolDb
  apiKey: string
  model: string
  fallbackModel: string
  formBaseUrl: string
  formSecret: string
  fetchFn?: typeof fetch
  db?: DbRepo
  ingatkanDiGrup?: (opsi: IngatkanGrupInput) => Promise<{ ok: boolean; pesan: string }>
}

export type JawabInput = {
  chatKey: string
  teks: string
  senderNomor: string | null
  senderNama: string | null
  isAdmin: boolean
  isGroup: boolean
  grupNama?: string | null
}

export function bersihkanJawaban(teks: string): string {
  const tanpaThink = teks.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^["']+|["']+$/g, '')
  return formatKeWhatsApp(tanpaThink)
}

function waktuWibSekarang(): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date())
}

async function panggilSatuModel(params: {
  apiKey: string
  model: string
  messages: ChatMessage[]
  tools?: typeof TOOL_DEFINITIONS
  temperature: number
  maxTokens: number
  fetchFn: typeof fetch
}): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: params.model,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    messages: params.messages,
  }
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools
    body.tool_choice = 'auto'
  }
  const res = await params.fetchFn(NIM_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`NIM ${params.model} membalas HTTP ${res.status}: ${errText.slice(0, 150)}`)
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]
  }
  const msg = json.choices?.[0]?.message
  if (!msg) throw new Error(`NIM ${params.model} mengembalikan respons kosong`)
  return { content: msg.content ?? '', tool_calls: msg.tool_calls }
}

async function panggilNim(params: {
  apiKey: string
  model: string
  fallbackModel: string
  messages: ChatMessage[]
  tools?: typeof TOOL_DEFINITIONS
  temperature: number
  maxTokens: number
  fetchFn?: typeof fetch
}): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const fn = params.fetchFn ?? fetch
  const kandidat =
    params.fallbackModel && params.fallbackModel !== params.model
      ? [params.model, params.fallbackModel]
      : [params.model]

  let errorTerakhir: Error | null = null
  for (const model of kandidat) {
    try {
      return await panggilSatuModel({ ...params, model, fetchFn: fn })
    } catch (err) {
      errorTerakhir = err instanceof Error ? err : new Error(String(err))
      console.error(`[AI] Gagal dengan model ${model}:`, errorTerakhir.message)
    }
  }
  throw errorTerakhir ?? new Error('Semua model AI gagal dihubungi')
}

function buatSystemPrompt(input: JawabInput): string {
  const lokasi = input.isGroup
    ? `Grup WhatsApp${input.grupNama ? ` (${input.grupNama})` : ''}`
    : 'Chat Pribadi (DM)'
  return [
    ...PERSONA_POINT,
    '',
    'Aturan utama:',
    '1. JANGAN bersikap kaku seperti bot/formulir tempelan. Jangan memakai template "Contoh perintah:" atau mengaku "Sebagai AI...".',
    '2. Untuk semua fakta tentang anggota, SELALU panggil tool database terlebih dahulu. Tag `@<angka>` di grup (misal `@5205684944979`) adalah ID WhatsApp (@lid) anggota — BUKAN ID grup; langsung cari lewat `detail_anggota` atau `cari_anggota`. Dilarang mengarang data.',
    '3. Sampaikan angka dan data persis sesuai hasil tool terbaru.',
    '4. Jika anggota menuliskan atau melengkapi data dirinya lewat chat (sekaligus maupun dicicil), ekstrak lalu panggil tool `simpan_data_diri`. Jika ada isian yang ditolak validasi, jelaskan dengan santai bagian yang perlu diperbaiki.',
    '5. Agar akun WA aman, JANGAN pernah menjanjikan japri keluar duluan. Arahkan anggota mengisi link formulir (`buat_link_formulir`) atau balas langsung lewat chat jika anggota sendiri yang menghubungi bot.',
    '6. Gunakan bahasa Indonesia sehari-hari yang ringkas dan enak dibaca di HP. Hindari istilah teknis seperti SQL, JSON, tool, `DATA_KURANG`, `LENGKAP`, atau `tipe_warna_unit`.',
    '7. Fitur `ingatkan_di_grup` hanya boleh dipanggil bila pengurus/admin yang meminta.',
    `8. ${ATURAN_FORMAT_WA}`,
    '',
    `Konteks saat ini:`,
    `- Waktu WIB: ${waktuWibSekarang()}`,
    `- Lokasi chat: ${lokasi}`,
    `- Pengirim: ${input.senderNama || 'Tidak diketahui'} (${input.senderNomor || 'nomor tidak terbaca'})`,
    `- Peran pengirim: ${input.isAdmin ? 'Pengurus / Admin' : 'Anggota'}`,
  ].join('\n')
}

function susunMessages(
  systemPrompt: string,
  riwayat: { arah: 'masuk' | 'keluar'; isi: string }[],
  teks: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const item of riwayat) {
    if (!item.isi?.trim()) continue
    messages.push({ role: item.arah === 'masuk' ? 'user' : 'assistant', content: item.isi })
  }
  const terakhir = messages[messages.length - 1]
  if (!(terakhir && terakhir.role === 'user' && terakhir.content === teks)) {
    messages.push({ role: 'user', content: teks })
  }
  return messages
}

async function prosesToolCalls(
  calls: ToolCall[],
  toolCtx: ToolContext,
  messages: ChatMessage[],
): Promise<void> {
  for (const call of calls) {
    let args: Record<string, unknown> = {}
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
    } catch {
      args = {}
    }
    const hasil = await jalankanTool(call.function.name, args, toolCtx).catch((err) =>
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    messages.push({ role: 'tool', tool_call_id: call.id, content: hasil })
  }
}

async function jalankanPutaranAi(
  messages: ChatMessage[],
  toolCtx: ToolContext,
  deps: AiDeps,
): Promise<string | null> {
  for (let putaran = 0; putaran < 5; putaran += 1) {
    const res = await panggilNim({
      apiKey: deps.apiKey, model: deps.model, fallbackModel: deps.fallbackModel,
      messages, tools: TOOL_DEFINITIONS, temperature: 0.65, maxTokens: 3000, fetchFn: deps.fetchFn,
    })
    if (res.tool_calls && res.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.tool_calls })
      await prosesToolCalls(res.tool_calls, toolCtx, messages)
      continue
    }
    const bersih = bersihkanJawaban(res.content)
    if (bersih) return bersih
    break
  }
  const penutup = await panggilNim({
    apiKey: deps.apiKey, model: deps.model, fallbackModel: deps.fallbackModel,
    messages, temperature: 0.65, maxTokens: 2500, fetchFn: deps.fetchFn,
  })
  return bersihkanJawaban(penutup.content) || null
}

export async function jawabPesan(input: JawabInput, deps: AiDeps): Promise<string> {
  const riwayat = input.chatKey
    ? await ambilRiwayatChat(deps.pool, input.chatKey, 12).catch(() => [])
    : []
  const messages = susunMessages(buatSystemPrompt(input), riwayat, input.teks)
  const toolCtx: ToolContext = {
    pool: deps.pool, chatKey: input.chatKey, senderNomor: input.senderNomor, senderNama: input.senderNama,
    isAdmin: input.isAdmin, isGroup: input.isGroup,
    formBaseUrl: deps.formBaseUrl, formSecret: deps.formSecret,
    ingatkanDiGrup: deps.ingatkanDiGrup, db: deps.db,
  }
  try {
    const hasil = await jalankanPutaranAi(messages, toolCtx, deps)
    if (hasil) return hasil
  } catch (err) {
    console.error('[AI] jawabPesan error:', err instanceof Error ? err.message : err)
  }
  return 'Maaf, koneksi ke otak AI lagi agak tersendat sebentar. Coba kirim ulang pesannya ya.'
}

export async function buatPengumumanKeluar(
  info: { nomor: string; nama: string | null },
  deps: Pick<AiDeps, 'apiKey' | 'model' | 'fallbackModel' | 'fetchFn'>,
): Promise<string> {
  const identitas = info.nama ? `${info.nama} (${info.nomor})` : info.nomor
  try {
    const res = await panggilNim({
      apiKey: deps.apiKey, model: deps.model, fallbackModel: deps.fallbackModel,
      temperature: 0.6, maxTokens: 220, fetchFn: deps.fetchFn,
      messages: [
        {
          role: 'system',
          content:
            'Kamu admin grup WhatsApp POINT. Tulis 1 kalimat pemberitahuan santai dan sopan bahwa seseorang baru keluar dari grup. Wajib sertakan identitas apa adanya.',
        },
        { role: 'user', content: `Identitas yang keluar: ${identitas}` },
      ],
    })
    const bersih = bersihkanJawaban(res.content)
    if (bersih && bersih.includes(info.nomor)) return bersih
  } catch (err) {
    console.error('[AI] buatPengumumanKeluar fallback:', err instanceof Error ? err.message : err)
  }
  return `Info grup: ${identitas} baru saja keluar dari grup.`
}

export async function buatSambutanMasuk(
  info: {
    nomor: string
    namaKontak: string | null
    mentionTag: string
    linkFormulir: string
    kekurangan: KolomWajib[]
    dariPendaftar?: boolean
  },
  deps: Pick<AiDeps, 'apiKey' | 'model' | 'fallbackModel' | 'fetchFn'>,
): Promise<string> {
  const sudahLengkap = Boolean(info.dariPendaftar) || info.kekurangan.length === 0
  const daftarKurang = info.kekurangan.map((k) => LABEL_KOLOM[k].toLowerCase()).join(', ')
  const cadangan = sudahLengkap
    ? `Selamat datang di grup POINT, ${info.mentionTag}! Data pendaftaran kamu sudah otomatis aktif dan lengkap di sistem kami.`
    : `Selamat datang di grup POINT, ${info.mentionTag}! Tolong lengkapi formulir anggota pakai nomor WA aktif kamu di:\n${info.linkFormulir}\nData kamu bakal langsung aktif otomatis.`

  try {
    const res = await panggilNim({
      apiKey: deps.apiKey, model: deps.model, fallbackModel: deps.fallbackModel,
      temperature: 0.7, maxTokens: 320, fetchFn: deps.fetchFn,
      messages: [
        {
          role: 'system',
          content: sudahLengkap
            ? 'Kamu admin grup WhatsApp POINT yang ramah. Tulis sambutan hangat (1-2 kalimat) untuk member baru dan kabarkan bahwa data pendaftarannya sudah otomatis aktif & lengkap. WAJIB menyertakan mention_wajib persis apa adanya.'
            : 'Kamu admin grup WhatsApp POINT yang ramah. Sapa dan tag member baru lalu minta mereka mengisi formulir pendaftaran di link_formulir_wajib pakai nomor WA aktif agar data otomatis aktif (atau boleh balas lewat japri). WAJIB menyertakan mention_wajib dan link_formulir_wajib persis apa adanya.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            mention_wajib: info.mentionTag,
            ...(sudahLengkap ? {} : { link_formulir_wajib: info.linkFormulir }),
            nama_kontak: info.namaKontak,
            data_yang_perlu_diisi: sudahLengkap ? 'sudah lengkap' : daftarKurang,
          }),
        },
      ],
    })
    const bersih = bersihkanJawaban(res.content)
    const linkOk = sudahLengkap || bersih.includes(info.linkFormulir)
    if (bersih && bersih.includes(info.mentionTag) && linkOk) return bersih
  } catch (err) {
    console.error('[AI] buatSambutanMasuk fallback:', err instanceof Error ? err.message : err)
  }
  return cadangan
}
