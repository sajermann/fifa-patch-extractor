export type RGB = [number | null, number | null, number | null]

export interface SourceStatus {
  state: 'empty' | 'loading' | 'ready' | 'error'
  path: string | null
  error: string | null
  token: string
  game_dir?: string
  database_from?: string
  language?: string
  languages?: string[]
  counts?: { leagues: number; teams: number; players: number; nations: number }
  suspect_birthdates?: (string | null)[]
  warnings?: string[]
}

export interface Config {
  language: 'pt-BR' | 'en' | null
  source_dir: string | null
  recent_sources: string[]
  game_language: string
  output_dir: string | null
}

export interface BasketCounts {
  leagues: number
  teams: number
  players: number
}

export interface Status {
  version: string
  source: SourceStatus
  config: Config
  exports_dir: string
  basket: BasketCounts
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
  sort: string
  dir: 'asc' | 'desc'
}

export interface LeagueRow {
  id: number
  name: string
  database_name: string | null
  level: number | null
  country_id: number | null
  country: string | null
  team_count: number
  has_logo: boolean
  in_basket: boolean
}

export interface TeamRow {
  id: number
  name: string
  abbr3: string | null
  league_ids: number[]
  league: string | null
  overall: number | null
  player_count: number
  has_crest: boolean
  kit_count: number
  national_team_of: number | null
  primary_color: RGB
  in_basket: boolean
  basket_players: number
}

export interface PlayerRow {
  id: number
  name: string
  overall: number | null
  potential: number | null
  position: string | null
  position_code: number | null
  nationality_id: number | null
  nationality: string | null
  birthdate: string | null
  birthdate_suspect: boolean
  age: number | null
  height: number | null
  team_id: number | null
  team: string | null
  team_ids: number[]
  has_face: boolean
  has_photo: boolean
  in_basket: boolean
}

export type Raw = Record<string, string | number | null>

export interface LeagueDetail extends LeagueRow {
  names: Record<string, string>
  images: string[]
  teams: TeamRow[]
  raw: Raw
}

export interface KitInfo {
  type: number
  role: 'home' | 'away' | 'goalkeeper' | null
  source_path: string
  where: string | null
  name_color: RGB | null
  fields: Record<string, number | null>
}

export interface RosterRow extends PlayerRow {
  jersey_number: number | null
  link_position: number | null
  link_position_name: string | null
  picked: boolean
}

export interface Ref {
  id: number
  name: string
}

export interface TeamDetail extends TeamRow {
  names: Record<string, string>
  colors: RGB[]
  leagues: Ref[]
  crest_where: string | null
  crest_no_background: boolean
  kits: KitInfo[]
  roster: RosterRow[]
  captain: Ref | null
  takers: Record<string, Ref | null>
  raw: Raw
}

export interface PlayerTeamLink {
  id: number
  name: string | null
  jersey_number: number | null
  position: number | null
  position_name: string | null
  picked: boolean
}

export interface PlayerDetail extends PlayerRow {
  names: Record<string, string>
  weight: number | null
  preferred_foot: 'left' | 'right' | null
  positions: { code: number; name: string | null }[]
  attributes: Record<string, number>
  appearance: Record<string, number>
  teams: PlayerTeamLink[]
  standalone: boolean
  face_files: { path: string; kind: string; where: string | null }[]
  photo_where: string | null
  raw: Raw
}

export interface Options {
  leagues: Ref[]
  nations: { id: number; name: string | null }[]
  positions: Ref[]
  levels: number[]
}

export interface BasketForm {
  patch_name: string
  credits: string
  credits_url: string
  include_originals: boolean
}

export interface BasketView {
  leagues: { id: number; name: string | null }[]
  teams: { id: number; name: string | null; players: number; roster: number | null; crest_no_background: boolean }[]
  players: { id: number; name: string | null }[]
  form: BasketForm
  counts: BasketCounts
}

export interface SavedSelection {
  id: string
  name: string
  created_at: string | null
  updated_at: string | null
  source_path: string | null
  leagues: number
  teams: number
  players: number
}

export interface ExportJob {
  id: string
  state: 'running' | 'done' | 'error'
  done: number
  total: number
  error: string | null
  result: {
    name: string
    path: string
    size: number
    warnings: string[]
    counts: { leagues: number; teams: number; players: number; nations: number }
  } | null
}

export interface ExportFile {
  name: string
  size: number
  modified: string
}
