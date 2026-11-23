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
  counts?: { leagues: number; teams: number; players: number; nations: number; stadiums: number }
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
  nations: number
  stadiums: number
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

export interface NationRow {
  id: number
  name: string
  database_name: string | null
  abbr3: string | null
  confederation: number | null
  top_tier: number | null
  league_count: number
  player_count: number
  national_team_id: number | null
  has_flag: boolean
  in_basket: boolean
}

export interface StadiumRow {
  id: number
  name: string
  /** the StadiumName_ text of the language database (patches often leave it behind) */
  language_name: string | null
  capacity: number | null
  country_id: number | null
  country: string | null
  home_team_id: number | null
  home_team: string | null
  team_count: number
  /** first picture variant of the menus (lists), or null */
  picture: number | null
  has_3d: boolean
  in_basket: boolean
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
  /** the team's colors (teamcolor1..3) the database has */
  colors: RGB[]
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
  /** the keys of the language names (full, abbr15, abbr, trophy, trophy_abbr15) */
  name_keys: string[]
  /** {key: {language: text}} in every language database of the game */
  language_names: Record<string, Record<string, string>>
  /** the league's country as a row of the countries list (null = no country) */
  country_row: (NationRow & { in_basket: boolean }) | null
  images: string[]
  teams: TeamRow[]
  raw: Raw
}

export interface NationDetail extends NationRow {
  names: Record<string, string>
  /** the keys of the language names (full, abbr3) */
  name_keys: string[]
  /** {key: {language: text}} in every language database of the game */
  language_names: Record<string, Record<string, string>>
  national_team: Ref | null
  leagues: LeagueRow[]
  flag_files: { path: string; where: string | null }[]
  audio: Raw | null
  raw: Raw
}

export interface StadiumInfo {
  id: number
  name: string
  names: Record<string, string>
  capacity: number | null
  year_built: number | null
  country_id: number | null
  country: string | null
  home_team: Ref | null
  team_count: number
  /** times of day the match screen offers in this stadium (1 = day, 3 = night) and the weather allowed in each */
  conditions: { time_of_day: number; rain: boolean; snow: boolean }[]
  pictures: number[]
  files: { path: string; where: string | null }[]
  /** times of day the 3D preview can show (1 = day, 3 = night); empty = no 3D files */
  times: number[]
  raw: Raw
}

export interface StadiumDetail extends StadiumRow {
  detail: StadiumInfo
  name_keys: string[]
  /** StadiumName_ in every language of the game: {key: {language: text}} */
  language_names: Record<string, Record<string, string>>
  teams: (TeamRow & { stadium_custom_name: string | null })[]
}

export interface KitInfo {
  type: number
  role: 'home' | 'away' | 'goalkeeper' | null
  source_path: string
  where: string | null
  name_color: RGB | null
  fields: Record<string, number | null>
  /** the name font's family name, and the colors the number color codes show */
  name_font_name: string | null
  number_rgb: RGB | null
  shorts_number_rgb: RGB | null
}

export interface RosterRow extends PlayerRow {
  back_name: string | null
  jersey_number: number | null
  link_position: number | null
  link_position_name: string | null
  picked: boolean
}

export interface Ref {
  id: number
  name: string
}

export interface Formation {
  id: number | null
  name: string | null
  /** which of the game's generic formations it is (relativeformationid) */
  base: number | null
  /** the 11 places: position code and name, x/y on the pitch (0-1, own goal at y 0) */
  positions: { code: number | null; name: string | null; x: number | null; y: number | null }[]
}

export interface TeamDetail extends TeamRow {
  names: Record<string, string>
  /** the keys of the language names and {key: {language: text}} in every language database of the game */
  name_keys: string[]
  language_names: Record<string, Record<string, string>>
  /** attack, midfield and defense ratings of the database */
  ratings: { attack: number | null; midfield: number | null; defense: number | null }
  /** the team's leagues as rows of the leagues list */
  league_rows: (LeagueRow & { in_basket: boolean })[]
  colors: RGB[]
  leagues: Ref[]
  crest_where: string | null
  crest_no_background: boolean
  kits: KitInfo[]
  roster: RosterRow[]
  captain: Ref | null
  takers: Record<string, Ref | null>
  stadiums: StadiumInfo[]
  stadium_custom_name: string | null
  formation: Formation | null
  club: Record<string, number | null>
  rival: Ref | null
  tactics: Record<string, number | null>
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
  traits: string[]
  all_traits: string[]
  accessories: Record<string, number>
  /** the accessory slots by place of the body, as the game's screen shows them */
  accessory_places: AccessoryPlaces
  animations: Record<string, number>
  career: { contract_until: number | null; joined: string | null; retiring: number | null }
  photo_where: string | null
  raw: Raw
}

export interface PreviewLook {
  real: boolean
  head: number
  hair: number
  hair_color: string
  eyes: number | null
  face: string
  skin: number
  sleeve: number
  socks: number
  shoe: number
  glove: number
  scale: number
  query?: string
  /** a real face shown although the player's row asks the game for a generic head (headclasscode 1) */
  generic_in_game?: boolean
}

export interface Options {
  leagues: Ref[]
  nations: { id: number; name: string | null }[]
  confederations: number[]
  positions: Ref[]
  teams: Ref[]
  levels: number[]
}

export interface BasketForm {
  patch_name: string
  credits: string
  credits_url: string
  include_originals: boolean
  include_stadiums: boolean
}

export interface BasketView {
  nations: { id: number; name: string | null }[]
  stadiums: { id: number; name: string | null }[]
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
  nations?: number
  stadiums?: number
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
    counts: { nations: number; leagues: number; teams: number; players: number; stadiums?: number }
  } | null
}

export interface ExportFile {
  name: string
  size: number
  modified: string
}

export interface AccessoryPlace {
  place: string
  code: number
  colour: number
  /** the place holds one thing only (yes / no) */
  single: boolean
  /** colour: a named colour; model: the glove model; none: no colour (nothing, or drawn from its own picture) */
  colour_kind: 'colour' | 'model' | 'none'
}

export interface AccessoryPlaces {
  places: AccessoryPlace[]
  used: number
  slots: number
  others: number
}
