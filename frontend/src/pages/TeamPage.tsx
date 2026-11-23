import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX, CornerUpLeft, CornerUpRight, Crown, Eye, Goal, MoveUpRight, ScanFace, Target, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import type { KitInfo, RGB, RosterRow, StadiumInfo, TeamDetail } from '@/api/types'
import { Badge, BasketButton, BasketCheck, Facts, FillScroll, OverallBadge, RawTable, Section } from '@/components/common/detail'
import { ColorDot, Crest, KitImage, LeagueImage, Photo } from '@/components/common/pictures'
import { LanguageNames } from '@/components/common/names'
import { FormationPitch } from '@/components/common/FormationPitch'
import { Preview3D } from '@/components/common/Preview3D'
import { Stadium3D, StadiumDatabase, StadiumDetails } from '@/components/common/stadium'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { previewKit } from '@/lib/preview'
import { useTab } from '@/lib/tabs'
import { cn } from '@/lib/utils'
import { useBasketOp, useToken } from '@/state/queries'
import { BackButton, usePageLabel } from '@/lib/back'

const TABS = ['data', 'crest', 'kits', 'leagues', 'roster', 'stadium', 'raw'] as const
// the name columns in the FIFA 14 Studio's order
const NAME_COLUMNS = ['full', 'abbr15', 'abbr10', 'abbr7', 'abbr3', 'commentary']

/** Every name the game has for the item, labelled. */
export function NameList({ names, prefix }: { names: Record<string, string>; prefix: 'teamName' | 'leagueName' | 'nationName' | 'stadiumName' }) {
  const { t } = useI18n()
  return (
    <Facts
      items={Object.entries(names).map(([k, v]) => {
        const key = `${prefix}.${k}`
        return [hasMessage(key) ? t(key as MessageKey) : k, v]
      })}
    />
  )
}

/** The goalkeeper with the highest overall and the `n` best outfield players (no goalkeeper: the n + 1 best). */
function bestPlayers(roster: RosterRow[], n: number) {
  const byOverall = [...roster].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || a.id - b.id)
  const keeper = byOverall.find((p) => p.position_code === 0)
  if (!keeper) return byOverall.slice(0, n + 1).map((p) => p.id)
  return [keeper.id, ...byOverall.filter((p) => p.position_code !== 0).slice(0, n).map((p) => p.id)]
}

export function TeamPage() {
  const { t } = useI18n()
  const id = Number(useParams().id)
  const token = useToken()
  const { data, error } = useQuery({ queryKey: ['team', token, id], queryFn: () => api.team(id), enabled: !!token })
  usePageLabel(data?.name)
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  const nobg = data.in_basket && data.crest_no_background
  return (
    <div className="space-y-4">
      <BackButton fallback={{ to: '/teams', label: t('nav.teams') }} />
      {/* one line like the FIFA 14 Studio's header: crest, name, leagues · ID */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Crest id={id} size={256} available={data.has_crest} noBackground={nobg} className="size-24 shrink-0" />
          <h1 className="min-w-0 text-2xl font-semibold break-words">{data.name}</h1>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {data.national_team_of !== null && <>{t('teams.nationalTeam')} · </>}
            {data.leagues.map((l) => (
              <span key={l.id}>
                <Link to={`/leagues/${l.id}`} className="hover:underline">
                  {l.name}
                </Link>
                {' · '}
              </span>
            ))}
            ID {data.id}
          </span>
          {data.in_basket && <span className="shrink-0 text-sm">{t('teams.inBasketPlayers', { count: data.basket_players, total: data.player_count })}</span>}
        </div>
        <BasketButton
          inside={data.in_basket}
          busy={op.isPending}
          labels={{ add: t('teams.addWithRoster'), remove: t('basket.remove') }}
          onToggle={() => op.mutate({ op: data.in_basket ? 'remove_team' : 'add_team', args: { id } })}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="data">{t('tab.data')}</TabsTrigger>
          <TabsTrigger value="crest">{t('tab.crestColors')}</TabsTrigger>
          <TabsTrigger value="kits">{t('tab.kits', { count: data.kits.length })}</TabsTrigger>
          <TabsTrigger value="leagues">{t('section.leaguesCount', { count: data.league_rows.length })}</TabsTrigger>
          <TabsTrigger value="roster">{t('tab.roster', { count: data.roster.length })}</TabsTrigger>
          <TabsTrigger value="stadium">{t('tab.stadium')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <DataTab data={data} />
        </TabsContent>
        <TabsContent value="crest">
          <CrestTab data={data} />
        </TabsContent>
        <TabsContent value="kits">
          <Kits data={data} />
        </TabsContent>
        <TabsContent value="leagues">
          <LeaguesTab data={data} />
        </TabsContent>
        <TabsContent value="roster">
          <Roster data={data} />
        </TabsContent>
        <TabsContent value="stadium">
          <Stadiums data={data} />
        </TabsContent>
        <TabsContent value="raw">
          <Section title={t('section.rawRow', { table: 'teams' })}>
            <RawTable raw={data.raw} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Same layout as the FIFA 14 Studio's Data tab (read-only): ratings and club in a column, the tactics beside them,
 * the names in every language below. */
function DataTab({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title={t('team.ratings')}>
            <Facts
              items={[
                [t('col.overall'), <OverallBadge key="o" value={data.overall} />],
                [t('team.attack'), data.ratings.attack ?? '—'],
                [t('team.midfield'), data.ratings.midfield ?? '—'],
                [t('team.defense'), data.ratings.defense ?? '—'],
              ]}
            />
          </Section>
          <Section title={t('fieldGroup.club')}>
            <Facts
              items={[
                ...Object.entries(data.club).map(([k, v]) => [label(t, k), k === 'transferbudget' && v !== null ? v.toLocaleString() : v] as [string, React.ReactNode]),
                [
                  t('field.rivalteam'),
                  data.rival ? (
                    <Link key="r" to={`/teams/${data.rival.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Crest id={data.rival.id} size={32} className="size-4" />
                      {data.rival.name}
                    </Link>
                  ) : (
                    '—'
                  ),
                ],
              ]}
            />
          </Section>
        </div>
        <Section title={t('fieldGroup.tactics')}>
          <Facts items={Object.entries(data.tactics).map(([k, v]) => [label(t, k), v] as [string, React.ReactNode])} />
        </Section>
      </div>
      <Section title={t('section.names')}>
        <div className="max-h-96 overflow-auto">
          <LanguageNames columns={NAME_COLUMNS} prefix="teamName" names={data.language_names} />
        </div>
      </Section>
    </div>
  )
}

/** The crest (as the game has it and without its background) and the team's colors, like the Studio's Crest and
 * colors tab. */
function CrestTab({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const op = useBasketOp()
  const checker = 'size-32 rounded bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]'
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title={t('section.crest')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-center text-xs text-muted-foreground">
            <Crest id={data.id} size={256} available={data.has_crest} className={checker} />
            {t('teams.crestOriginal')}
          </div>
          {data.has_crest && (
            <div className="text-center text-xs text-muted-foreground">
              <Crest id={data.id} size={256} noBackground className={checker} />
              {t('teams.crestNoBackground')}
            </div>
          )}
        </div>
        {data.has_crest && (
          <div className="mt-4 flex items-center gap-3">
            <Switch
              id="nobg"
              checked={data.crest_no_background}
              disabled={!data.in_basket || op.isPending}
              onCheckedChange={(v) => op.mutate({ op: 'set_team', args: { id: data.id, crest_no_background: v } })}
            />
            <Label htmlFor="nobg" className="text-sm">
              {t('teams.crestNoBackgroundSwitch')}
            </Label>
          </div>
        )}
        {data.has_crest && !data.in_basket && <p className="mt-1 text-xs text-muted-foreground">{t('teams.crestSwitchHint')}</p>}
        <div className="mt-4">
          <Facts items={[[t('teams.crestFrom'), data.crest_where ?? '—']]} />
        </div>
      </Section>
      <Section title={t('col.colors')}>
        <Facts
          items={data.colors.map(
            (c, i) =>
              [
                t('teams.colorN', { n: i + 1 }),
                <span key={i} className="inline-flex items-center gap-2">
                  <ColorDot rgb={c} />
                  <span className="font-mono text-xs text-muted-foreground">{c.join(', ')}</span>
                </span>,
              ] as [string, React.ReactNode],
          )}
        />
      </Section>
    </div>
  )
}

/** The leagues the team plays in (the Studio's Leagues tab, without the editing). */
function LeaguesTab({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  if (!data.league_rows.length) return <p className="py-6 text-sm text-muted-foreground">{t('teams.noLeagues')}</p>
  return (
    <Section title={t('section.leaguesCount', { count: data.league_rows.length })}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>{t('col.name')}</TableHead>
            <TableHead className="text-right">{t('col.country')}</TableHead>
            <TableHead className="w-28 text-center">{t('col.level')}</TableHead>
            <TableHead className="w-28 text-center">{t('col.teams')}</TableHead>
            <TableHead className="w-28">{t('col.id')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.league_rows.map((l) => (
            <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leagues/${l.id}`)}>
              <TableCell>
                <LeagueImage id={l.id} size={64} available={l.has_logo} className="size-8" />
              </TableCell>
              <TableCell className="font-medium">{l.name}</TableCell>
              <TableCell className="text-right">{l.country ?? '—'}</TableCell>
              <TableCell className="text-center tabular-nums">{l.level ?? '—'}</TableCell>
              <TableCell className="text-center tabular-nums">{l.team_count}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{l.id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  )
}

/** A database column's label (field.<column>, as in the FIFA 14 Studio), else the column itself. */
const label = (t: (k: MessageKey) => string, column: string) => (hasMessage(`field.${column}`) ? t(`field.${column}` as MessageKey) : column)

function Roster({ data }: { data: TeamDetail }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <RosterTable data={data} />
        <Takers data={data} />
      </div>
      <Formation data={data} />
    </div>
  )
}

// captain and set-piece takers, as the FIFA 14 Studio shows them (a column of the squad table and a card below it)
const ROLES: { key: 'captain' | keyof TeamDetail['takers']; label: MessageKey; icon: LucideIcon }[] = [
  { key: 'captain', label: 'takers.captainRole', icon: Crown },
  { key: 'penalty', label: 'takers.penalty', icon: Target },
  { key: 'free_kick', label: 'takers.freeKick', icon: Goal },
  { key: 'long_free_kick', label: 'takers.longFreeKick', icon: MoveUpRight },
  { key: 'left_corner', label: 'takers.leftCorner', icon: CornerUpLeft },
  { key: 'right_corner', label: 'takers.rightCorner', icon: CornerUpRight },
]
const roleOf = (data: TeamDetail, key: (typeof ROLES)[number]['key']) => (key === 'captain' ? data.captain : data.takers[key])

/** Who is the captain and who takes each set piece (read-only). */
function Takers({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  return (
    <Section title={t('takers.title')}>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {ROLES.map(({ key, label, icon: Icon }) => {
          const who = roleOf(data, key)
          return (
            <div key={key} className="grid gap-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Icon className="size-4" /> {t(label)}
              </span>
              {who ? (
                <Link to={`/players/${who.id}`} className="hover:underline">
                  {who.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Formation({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const f = data.formation
  return (
    <Section title={f?.name ? `${t('squad.formation')}: ${f.name}` : t('squad.formation')} className="xl:sticky xl:top-0">
      {f ? (
        <>
          <FormationPitch formation={f} roster={data.roster} />
          <p className="mt-2 text-xs text-muted-foreground">{t('teams.formationHint')}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('teams.noFormation')}</p>
      )}
    </Section>
  )
}

const SCROLL_RESERVE = 250 // height kept under the table for the captain and takers card (as the FIFA 14 Studio)

function RosterTable({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const op = useBasketOp()
  const [n, setN] = useState(12)
  const setPlayers = (players: number[]) => op.mutate({ op: 'set_team', args: { id: data.id, players } })
  const picked = data.roster.filter((p) => p.picked).map((p) => p.id)
  const toggle = (pid: number, on: boolean) => setPlayers(on ? [...picked, pid] : picked.filter((x) => x !== pid))
  return (
    <Section
      title={data.in_basket ? t('teams.rosterPicked', { count: picked.length, total: data.roster.length }) : t('teams.rosterNotInBasket')}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={op.isPending} onClick={() => setPlayers(data.roster.map((p) => p.id))}>
            {t('teams.pickAll')}
          </Button>
          <Button size="sm" variant="outline" disabled={op.isPending || !data.in_basket} onClick={() => setPlayers([])}>
            {t('teams.pickNone')}
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={op.isPending} onClick={() => setPlayers(bestPlayers(data.roster, n))}>
              {t('teams.pickBest', { count: n })}
            </Button>
            <Input type="number" min={1} max={40} value={n} onChange={(e) => setN(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} className="h-8 w-16" aria-label={t('teams.bestCount')} />
          </div>
        </div>
      }
    >
      {/* the players scroll inside the card, with the header on top (like the FIFA 14 Studio's squad) */}
      <FillScroll reserve={SCROLL_RESERVE}>
      <Table>
        <TableHeader className="sticky top-0 z-10 shadow-[0_1px_0_var(--border)] [&_th]:bg-card">
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-10" />
            <TableHead>{t('col.name')}</TableHead>
            <TableHead className="w-20 text-center">{t('col.overall')}</TableHead>
            <TableHead className="w-20 text-center">{t('col.number')}</TableHead>
            <TableHead className="w-28 text-center">{t('col.position')}</TableHead>
            {ROLES.map(({ key, label, icon: Icon }) => (
              <TableHead key={key} className="w-8 px-1 text-center" title={t(label)}>
                <Icon className="mx-auto size-4" aria-label={t(label)} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.roster.map((p) => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/players/${p.id}`)}>
              <TableCell>
                <BasketCheck checked={p.picked} disabled={op.isPending} label={t('teams.pickPlayer')} onChange={(v) => toggle(p.id, v)} />
              </TableCell>
              <TableCell>
                <Photo id={p.id} size={64} available={p.has_photo} className="size-8 rounded" />
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2 font-medium">
                  {p.name}
                  {p.has_face && <ScanFace className="size-4 text-emerald-600 dark:text-emerald-400" />}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <OverallBadge value={p.overall} />
              </TableCell>
              <TableCell className="text-center tabular-nums">{p.jersey_number ?? '—'}</TableCell>
              <TableCell className="text-center">
                <Badge>{p.link_position_name ?? p.link_position ?? '—'}</Badge>
              </TableCell>
              {ROLES.map(({ key, label, icon: Icon }) => (
                <TableCell key={key} className="px-1 text-center">
                  {roleOf(data, key)?.id === p.id && <Icon className="mx-auto size-4 text-primary" aria-label={t(label)} />}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </FillScroll>
    </Section>
  )
}

/** A yes/no value of a kit (a placement code: 0 = no). */
function YesNo({ on }: { on: boolean }) {
  const { t } = useI18n()
  return on ? (
    <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label={t('common.yes')} />
  ) : (
    <CircleX className="size-4 text-destructive" aria-label={t('common.no')} />
  )
}

/** The kit's name and number values with their meaning (as the FIFA 14 Studio names them), in two columns. */
function KitFacts({ kit: k }: { kit: KitInfo }) {
  const { t } = useI18n()
  const f = k.fields
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)
  const color = (rgb: RGB | null, code: number | null | undefined) =>
    code === null || code === undefined ? (
      '—'
    ) : (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {t('kit.colorN', { n: code })}
        {rgb && <ColorDot rgb={rgb} />}
      </span>
    )
  const layout = f.jerseynamelayouttype
  const items: [string, React.ReactNode][] = [
    [t('kit.nameColor'), k.name_color ? <ColorDot key="n" rgb={k.name_color} /> : '—'],
    [t('kit.collar'), f.jerseycollargeometrytype === undefined || f.jerseycollargeometrytype === null ? '—' : t('kit.collarOption', { n: f.jerseycollargeometrytype })],
    [t('kit.showName'), <YesNo key="s" on={!!f.jerseybacknameplacementcode} />],
    [t('kit.nameLayout'), layout === 0 ? t('kit.nameStraight') : layout === 1 ? t('kit.nameArc') : num(layout)],
    [t('kit.nameCase'), num(f.jerseybacknamefontcase)],
    [t('kit.frontNumber'), <YesNo key="fn" on={!!f.jerseyfrontnumberplacementcode} />],
    [t('kit.numberFont'), num(f.numberfonttype)],
    [t('kit.numberColor'), color(k.number_rgb, f.numbercolor)],
    [t('kit.shortsNumberOn'), <YesNo key="sn" on={!!f.shortsnumberplacementcode} />],
    [t('kit.shortsNumberFont'), num(f.shortsnumberfonttype)],
    [t('kit.shortsNumberColor'), color(k.shorts_number_rgb, f.shortsnumbercolor)],
  ]
  return (
    <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-right break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function kitTitle(t: (k: MessageKey, p?: Record<string, unknown>) => string, kit: KitInfo) {
  return kit.role ? t(`kitRole.${kit.role}` as MessageKey) : t('kitRole.other', { type: kit.type })
}

/** The player whose face, name and number the preview shows: a goalkeeper for the goalkeeper kit, else the first
 * outfield player of the squad (as the FIFA 14 Studio does). */
function wearerOf(roster: RosterRow[], kind: number) {
  const isKeeper = (r: RosterRow) => (r.link_position ?? r.position_code) === 0
  const row = (kind === 2 ? roster.find(isKeeper) : roster.find((r) => !isKeeper(r))) ?? roster[0]
  return { id: row?.id ?? 0, number: row?.jersey_number ?? (kind === 2 ? 1 : 10), name: row?.back_name || row?.name || null }
}

function Kits({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const token = useToken()
  const [shown, setShown] = useState<number | null>(null)
  if (!data.kits.length) return <p className="py-6 text-sm text-muted-foreground">{t('teams.noKits')}</p>
  const kit = data.kits.find((k) => k.type === shown) ?? data.kits[0]
  const wearer = wearerOf(data.roster, kit.type)
  const preview = previewKit(token, data.id, kit.type, { collar: kit.fields.jerseycollargeometrytype ?? 0, number: wearer.number, name: wearer.name })
  return (
    <Section title={t('kit.title')} description={t('kit.hint')}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 2xl:grid-cols-2">
          {data.kits.map((k) => (
            // the kit being previewed gets a ring, like in the FIFA 14 Studio
            <div key={k.type} className={cn('space-y-4 rounded-lg border p-4', k.type === kit.type && 'ring-2 ring-primary/50')}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{kitTitle(t, k)}</p>
                <div className="flex items-center gap-2">
                  <Badge>{k.where ?? '—'}</Badge>
                  <Button size="sm" variant={k.type === kit.type ? 'secondary' : 'ghost'} onClick={() => setShown(k.type)} title={t('kit.previewHint')}>
                    <Eye /> {t('kit.preview')}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <KitImage team={data.id} type={k.type} part="jersey" size={512} className="size-56 rounded border bg-muted/40" />
                <KitImage team={data.id} type={k.type} part="shorts" size={512} className="h-56 w-56 rounded border bg-muted/40" />
              </div>
              <div className="space-y-3">
                <KitFacts kit={k} />
                {/* the long values, one per line */}
                <Facts
                  items={[
                    [t('kit.nameFont'), k.fields.jerseynamefonttype === undefined || k.fields.jerseynamefonttype === null ? '—' : k.name_font_name ? `${k.name_font_name} (${k.fields.jerseynamefonttype})` : k.fields.jerseynamefonttype],
                    [t('kit.file'), <span key="f" className="font-mono text-xs break-all">{k.source_path}</span>],
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-lg border bg-card p-3 lg:sticky lg:top-0">
          <div>
            <p className="font-medium">{t('preview.kitTitle', { kit: kitTitle(t, kit) })}</p>
            <p className="text-xs text-muted-foreground">{t('preview.kitHint')}</p>
          </div>
          <Preview3D kit={preview} wearer={wearer.id} />
        </div>
      </div>
    </Section>
  )
}

function TeamStadium({ stadium, customName }: { stadium: StadiumInfo; customName: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-4">
      <Stadium3D stadium={stadium} open={open} setOpen={setOpen} className={open ? 'h-[70vh]' : undefined} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <StadiumDetails stadium={stadium} customName={customName} />
        <StadiumDatabase stadium={stadium} className="xl:grid-cols-1" />
      </div>
    </div>
  )
}

function Stadiums({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  if (!data.stadiums.length) return <p className="py-6 text-sm text-muted-foreground">{t('teams.noStadium')}</p>
  return (
    <div className="space-y-4">
      {data.stadiums.map((s) => (
        <TeamStadium key={s.id} stadium={s} customName={data.stadiums.length === 1 ? data.stadium_custom_name : null} />
      ))}
    </div>
  )
}
