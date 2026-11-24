import { hasMessage, translate } from '@/i18n'
import type {
  BasketCounts,
  BasketView,
  Config,
  ExportFile,
  ExportJob,
  LeagueDetail,
  NationDetail,
  NationRow,
  StadiumDetail,
  StadiumRow, AdboardRow, EquipmentKind, EquipmentRow,
  LeagueRow,
  Options,
  Page,
  PlayerDetail,
  PlayerRow,
  PreviewLook,
  Ref,
  SavedSelection,
  SourceStatus,
  Status,
  TeamDetail,
  TeamRow,
} from './types'

/** Error of the backend; `message` is in the interface language when the app knows its code. */
export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'backend_unreachable', translate('apiError.backend_unreachable'))
  }
  if (!res.ok) {
    let detail: unknown = null
    try {
      detail = (await res.json()).detail
    } catch {
      /* not JSON */
    }
    const d = (detail && typeof detail === 'object' ? detail : {}) as { code?: string; detail?: string }
    const key = `apiError.${d.code}`
    const text = d.code && hasMessage(key) ? translate(key) : translate('apiError.status', { status: res.status })
    throw new ApiError(res.status, d.code, d.detail ? `${text} (${d.detail})` : text)
  }
  return (await res.json()) as T
}

const get = <T>(url: string) => request<T>('GET', url)
const post = <T>(url: string, body: unknown = {}) => request<T>('POST', url, body)

/** Query string of the set values only. */
export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export type ListParams = Record<string, string | number | undefined>

export const api = {
  status: () => get<Status>('/api/status'),
  loadSource: (path: string) => post<SourceStatus>('/api/source', { path }),
  forgetRecent: (path: string) => request<Config>('DELETE', `/api/source/recent${query({ path })}`),
  saveSettings: (fields: Partial<Config>) => request<Config>('PUT', '/api/settings', fields),
  pickFolder: (initial?: string | null, title?: string) =>
    post<{ path: string | null }>('/api/dialog/folder', { initial, title }),

  stadiums: (p: ListParams) => get<Page<StadiumRow>>(`/api/stadiums${query(p)}`),
  adboards: (p: ListParams) => get<Page<AdboardRow>>(`/api/adboards${query(p)}`),
  equipment: (kind: EquipmentKind, p: ListParams) => get<Page<EquipmentRow>>(`/api/equipment/${kind}${query(p)}`),
  nations: (p: ListParams) => get<Page<NationRow>>(`/api/nations${query(p)}`),
  leagues: (p: ListParams) => get<Page<LeagueRow>>(`/api/leagues${query(p)}`),
  teams: (p: ListParams) => get<Page<TeamRow>>(`/api/teams${query(p)}`),
  players: (p: ListParams) => get<Page<PlayerRow>>(`/api/players${query(p)}`),
  options: () => get<Options>('/api/options'),
  lookup: (kind: 'stadiums' | 'nations' | 'leagues' | 'teams' | 'players', ids: number[]) =>
    get<Ref[]>(`/api/lookup${query({ kind, ids: ids.join(',') })}`),
  stadium: (id: number) => get<StadiumDetail>(`/api/stadiums/${id}`),
  nation: (id: number) => get<NationDetail>(`/api/nations/${id}`),
  league: (id: number) => get<LeagueDetail>(`/api/leagues/${id}`),
  team: (id: number) => get<TeamDetail>(`/api/teams/${id}`),
  player: (id: number) => get<PlayerDetail>(`/api/players/${id}`),
  previewLook: (id: number) => get<PreviewLook>(`/api/preview/look/${id}`),

  basket: () => get<BasketView>('/api/basket'),
  basketOp: (op: string, args: Record<string, unknown> = {}) => post<BasketCounts>('/api/basket', { op, args }),

  selections: () => get<SavedSelection[]>('/api/selections'),
  saveSelection: (name: string) => post<SavedSelection>('/api/selections', { name }),
  loadSelection: (id: string) => post<BasketCounts>(`/api/selections/${id}/load`),
  deleteSelection: (id: string) => request<{ ok: boolean }>('DELETE', `/api/selections/${id}`),

  startExport: () => post<ExportJob>('/api/export'),
  exportJob: (id: string) => get<ExportJob>(`/api/export/${id}`),
  exports: () => get<ExportFile[]>('/api/exports'),
  deleteExport: (name: string) => request<{ ok: boolean }>('DELETE', `/api/exports/${encodeURIComponent(name)}`),
  openExportsFolder: () => post<{ path: string }>('/api/exports/open-folder'),
}

export const exportUrl = (name: string) => `/api/exports/${encodeURIComponent(name)}`
