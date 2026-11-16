import { useQuery } from '@tanstack/react-query'
import { ScanFace } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import type { KitInfo, RosterRow, TeamDetail } from '@/api/types'
import { BackButton, Badge, BasketButton, BasketCheck, Facts, OverallBadge, RawTable, Section } from '@/components/common/detail'
import { ColorDot, Crest, KitImage, Photo } from '@/components/common/pictures'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { useBasketOp, useToken } from '@/state/queries'

const TABS = ['overview', 'roster', 'kits', 'raw'] as const

/** Every name the game has for the item, labelled. */
export function NameList({ names, prefix }: { names: Record<string, string>; prefix: 'teamName' | 'leagueName' | 'playerName' }) {
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
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  const nobg = data.in_basket && data.crest_no_background
  return (
    <div className="space-y-6">
      <BackButton fallback="/teams" />
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
            [t('teams.crestFrom'), data.crest_where ?? '—'],
          ]}
        />
      </Section>
    </div>
  )
}

function Roster({ data }: { data: TeamDetail }) {
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

function Kits({ data }: { data: TeamDetail }) {
  const { t } = useI18n()
  if (!data.kits.length) return <p className="py-6 text-sm text-muted-foreground">{t('teams.noKits')}</p>
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {data.kits.map((kit) => (
        <Section key={kit.type} title={kitTitle(t, kit)} action={<Badge>{kit.where ?? '—'}</Badge>}>
          <div className="flex flex-wrap gap-4">
            <KitImage team={data.id} type={kit.type} part="jersey" size={512} className="size-56 rounded border bg-muted/40" />
            <KitImage team={data.id} type={kit.type} part="shorts" size={512} className="h-56 w-56 rounded border bg-muted/40" />
          </div>
          <div className="mt-4">
            <Facts
              items={[
                [t('kit.nameColor'), kit.name_color ? <ColorDot key="n" rgb={kit.name_color} /> : '—'],
                ...Object.entries(kit.fields).map(([k, v]) => [KIT_FIELD_LABELS[k] ? t(KIT_FIELD_LABELS[k]) : k, v ?? '—'] as [string, React.ReactNode]),
                [t('kit.file'), <span key="f" className="font-mono text-xs">{kit.source_path}</span>],
              ]}
            />
          </div>
        </Section>
      ))}
    </div>
  )
}
