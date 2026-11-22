import { useQuery } from '@tanstack/react-query'
import { Box, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import type { KitInfo, RosterRow, StadiumInfo, TeamDetail } from '@/api/types'
import { Badge, BasketButton, BasketCheck, Facts, OverallBadge, RawTable, Section } from '@/components/common/detail'
import { ColorDot, Crest, KitImage, Photo } from '@/components/common/pictures'
import { FormationPitch } from '@/components/common/FormationPitch'
import { Preview3D } from '@/components/common/Preview3D'
import { Stadium3D, StadiumDatabase, StadiumDetails } from '@/components/common/stadium'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { previewKit } from '@/lib/preview'
import { useTab } from '@/lib/tabs'
import { useBasketOp, useToken } from '@/state/queries'
import { BackButton, usePageLabel } from '@/lib/back'

const TABS = ['overview', 'roster', 'kits', 'stadium', 'raw'] as const

/** Every name the game has for the item, labelled. */
export function NameList({ names, prefix }: { names: Record<string, string>; prefix: 'teamName' | 'leagueName' | 'playerName' | 'nationName' | 'stadiumName' }) {
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
    <div className="space-y-6">
      <BackButton fallback={{ to: '/teams', label: t('nav.teams') }} />
      <div className="flex flex-wrap items-center gap-5">
        <Crest id={id} size={256} available={data.has_crest} noBackground={nobg} className="size-24" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[data.national_team_of !== null ? t('teams.nationalTeam') : null, ...data.leagues.map((l) => l.name), `#${data.id}`].filter(Boolean).join(' · ')}
          </p>
          {data.in_basket && <p className="mt-1 text-sm">{t('teams.inBasketPlayers', { count: data.basket_players, total: data.player_count })}</p>}
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
          <TabsTrigger value="overview">{t('tab.overview')}</TabsTrigger>
          <TabsTrigger value="roster">{t('tab.roster', { count: data.roster.length })}</TabsTrigger>
          <TabsTrigger value="kits">{t('tab.kits', { count: data.kits.length })}</TabsTrigger>
          <TabsTrigger value="stadium">{t('tab.stadium')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview data={data} />
        </TabsContent>
        <TabsContent value="roster">
          <Roster data={data} />
        </TabsContent>
        <TabsContent value="kits">
          <Kits data={data} />
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

function Overview({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  const op = useBasketOp()
  const ref = (r: { id: number; name: string } | null) => (r ? <Link to={`/players/${r.id}`} className="hover:underline">{r.name}</Link> : '—')
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('section.names')}>
        <NameList names={data.names} prefix="teamName" />
      </Section>
      <Section title={t('section.crest')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-center text-xs text-muted-foreground">
            <Crest id={data.id} size={256} available={data.has_crest} className="size-32 rounded bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]" />
            {t('teams.crestOriginal')}
          </div>
          {data.has_crest && (
            <div className="text-center text-xs text-muted-foreground">
              <Crest id={data.id} size={256} noBackground className="size-32 rounded bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]" />
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
      </Section>
      <Section title={t('section.details')}>
        <Facts
          items={[
            [t('col.overall'), <OverallBadge key="o" value={data.overall} />],
            [
              t('col.colors'),
              <span key="c" className="inline-flex gap-1.5">
                {data.colors.map((c, i) => (
                  <ColorDot key={i} rgb={c} />
                ))}
              </span>,
            ],
            [t('col.leagues'), data.leagues.length ? data.leagues.map((l) => <Link key={l.id} to={`/leagues/${l.id}`} className="mr-2 hover:underline">{l.name}</Link>) : '—'],
            [t('teams.captain'), ref(data.captain)],
            ...Object.entries(data.takers).map(([k, v]) => [t(`taker.${k}` as MessageKey), ref(v)] as [string, React.ReactNode]),
            [
              t('teams.stadium'),
              data.stadiums.length ? data.stadium_custom_name ?? data.stadiums.map((s) => s.name).join(', ') : '—',
            ],
            [t('teams.crestFrom'), data.crest_where ?? '—'],
          ]}
        />
      </Section>
      <Section title={t('fieldGroup.club')}>
        <Facts
          items={[
            ...Object.entries(data.club).map(([k, v]) => [label(t, k), k === 'transferbudget' && v !== null ? v.toLocaleString() : v] as [string, React.ReactNode]),
            [t('field.rivalteam'), data.rival ? <Link key="r" to={`/teams/${data.rival.id}`} className="hover:underline">{data.rival.name}</Link> : '—'],
          ]}
        />
      </Section>
      <Section title={t('fieldGroup.tactics')}>
        <Facts items={Object.entries(data.tactics).map(([k, v]) => [label(t, k), v] as [string, React.ReactNode])} />
      </Section>
    </div>
  )
}

/** A database column's label (field.<column>, as in the FIFA 14 Studio), else the column itself. */
const label = (t: (k: MessageKey) => string, column: string) => (hasMessage(`field.${column}`) ? t(`field.${column}` as MessageKey) : column)

function Roster({ data }: { data: TeamDetail }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <RosterTable data={data} />
      <Formation data={data} />
    </div>
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-10" />
            <TableHead>{t('col.number')}</TableHead>
            <TableHead>{t('col.name')}</TableHead>
            <TableHead>{t('col.inTeam')}</TableHead>
            <TableHead>{t('col.position')}</TableHead>
            <TableHead>{t('col.overall')}</TableHead>
            <TableHead>{t('col.age')}</TableHead>
            <TableHead>{t('col.nationality')}</TableHead>
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
              <TableCell className="tabular-nums">{p.jersey_number ?? '—'}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2 font-medium">
                  {p.name}
                  {p.has_face && <ScanFace className="size-4 text-emerald-600 dark:text-emerald-400" />}
                </span>
              </TableCell>
              <TableCell>
                <Badge>{p.link_position_name ?? p.link_position ?? '—'}</Badge>
              </TableCell>
              <TableCell>{p.position ?? '—'}</TableCell>
              <TableCell>
                <OverallBadge value={p.overall} />
              </TableCell>
              <TableCell className="tabular-nums">{p.birthdate_suspect ? '?' : (p.age ?? '—')}</TableCell>
              <TableCell>{p.nationality ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  )
}

const KIT_FIELD_LABELS: Record<string, MessageKey> = {
  jerseycollargeometrytype: 'kit.collar',
  jerseynamefonttype: 'kit.nameFont',
  jerseynamelayouttype: 'kit.nameLayout',
  jerseybacknamefontcase: 'kit.nameCase',
  jerseybacknameplacementcode: 'kit.backNamePlacement',
  numberfonttype: 'kit.numberFont',
  numbercolor: 'kit.numberColor',
  jerseyfrontnumberplacementcode: 'kit.frontNumberPlacement',
  shortsnumberfonttype: 'kit.shortsNumberFont',
  shortsnumbercolor: 'kit.shortsNumberColor',
  shortsnumberplacementcode: 'kit.shortsNumberPlacement',
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-6 2xl:grid-cols-2">
        {data.kits.map((k) => (
          <Section
            key={k.type}
            title={kitTitle(t, k)}
            className={k.type === kit.type ? 'ring-2 ring-primary/50' : undefined}
            action={
              <div className="flex items-center gap-2">
                <Badge>{k.where ?? '—'}</Badge>
                <Button size="sm" variant={k.type === kit.type ? 'default' : 'outline'} onClick={() => setShown(k.type)}>
                  <Box /> {t('preview.show3d')}
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-4">
              <KitImage team={data.id} type={k.type} part="jersey" size={512} className="size-56 rounded border bg-muted/40" />
              <KitImage team={data.id} type={k.type} part="shorts" size={512} className="h-56 w-56 rounded border bg-muted/40" />
            </div>
            <div className="mt-4">
              <Facts
                items={[
                  [t('kit.nameColor'), k.name_color ? <ColorDot key="n" rgb={k.name_color} /> : '—'],
                  ...Object.entries(k.fields).map(([f, v]) => [KIT_FIELD_LABELS[f] ? t(KIT_FIELD_LABELS[f]) : f, v ?? '—'] as [string, React.ReactNode]),
                  [t('kit.file'), <span key="f" className="font-mono text-xs">{k.source_path}</span>],
                ]}
              />
            </div>
          </Section>
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
  )
}

function TeamStadium({ stadium, customName }: { stadium: StadiumInfo; customName: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-6">
      <Stadium3D stadium={stadium} open={open} setOpen={setOpen} className={open ? 'h-[70vh]' : undefined} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
    <div className="space-y-6">
      {data.stadiums.map((s) => (
        <TeamStadium key={s.id} stadium={s} customName={data.stadiums.length === 1 ? data.stadium_custom_name : null} />
      ))}
    </div>
  )
}
