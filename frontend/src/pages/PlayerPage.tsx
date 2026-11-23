import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Minus, ScanFace } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import type { PlayerDetail } from '@/api/types'
import { Badge, BasketButton, BasketCheck, Facts, OverallBadge, Rating, RawTable, Section } from '@/components/common/detail'
import { Flag, Photo } from '@/components/common/pictures'
import { Preview3D } from '@/components/common/Preview3D'
import { previewKit } from '@/lib/preview'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { cn } from '@/lib/utils'
import { useBasketOp, useToken } from '@/state/queries'
import { BackButton, usePageLabel } from '@/lib/back'

const TABS = ['data', 'attributes', 'traits', 'look', 'accessories', 'raw'] as const

// the traits as the game groups them (as on the FIFA 14 Studio's Traits tab)
const GOALKEEPER_TRAITS = ['pushes_up_for_corners', 'puncher', 'gk_long_thrower', 'gk_one_on_one', 'gk_flat_kick']
const SKILL_TRAITS = ['fancy_feet', 'fancy_passes', 'fancy_flicks', 'stutter_penalty', 'chipped_penalty', 'bicycle_kicks', 'diving_header', 'driven_pass']

const GROUPS: [MessageKey, string[]][] = [
  ['attrGroup.pace', ['acceleration', 'sprint_speed']],
  ['attrGroup.shooting', ['finishing', 'shot_power', 'long_shots', 'volleys', 'penalties', 'positioning']],
  ['attrGroup.passing', ['vision', 'crossing', 'freekick_accuracy', 'short_passing', 'long_passing', 'curve']],
  ['attrGroup.dribbling', ['agility', 'balance', 'reactions', 'ball_control', 'dribbling']],
  ['attrGroup.defending', ['interceptions', 'heading_accuracy', 'marking', 'standing_tackle', 'sliding_tackle']],
  ['attrGroup.physical', ['jumping', 'stamina', 'strength', 'aggression']],
  ['attrGroup.goalkeeping', ['gk_diving', 'gk_handling', 'gk_kicking', 'gk_positioning', 'gk_reflexes']],
]

const label = (t: (k: MessageKey) => string, prefix: string, key: string) => {
  const k = `${prefix}.${key}`
  return hasMessage(k) ? t(k as MessageKey) : key
}

export function PlayerPage() {
  const { t } = useI18n()
  const id = Number(useParams().id)
  const token = useToken()
  const { data, error } = useQuery({ queryKey: ['player', token, id], queryFn: () => api.player(id), enabled: !!token })
  usePageLabel(data?.name)
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  return (
    <div className="space-y-6">
      <BackButton fallback={{ to: '/players', label: t('nav.players') }} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Photo id={id} size={256} available={data.has_photo} className="size-24 shrink-0 rounded-lg bg-muted/40" />
          <h1 className="min-w-0 text-2xl font-semibold break-words">{data.name}</h1>
          <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums">
            {data.has_face && <ScanFace className="size-5 text-emerald-600 dark:text-emerald-400" aria-label={t('players.hasFace')} />}
            <OverallBadge value={data.overall} />
            ID {data.id}
          </span>
        </div>
        <BasketButton
          inside={data.in_basket}
          busy={op.isPending}
          onToggle={() => op.mutate({ op: data.in_basket ? 'remove_players' : 'add_players', args: { ids: [id] } })}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="data">{t('player.tab.data')}</TabsTrigger>
          <TabsTrigger value="attributes">{t('tab.attributes')}</TabsTrigger>
          <TabsTrigger value="traits">{t('player.tab.traits')}</TabsTrigger>
          <TabsTrigger value="look">{t('player.tab.look')}</TabsTrigger>
          <TabsTrigger value="accessories">{t('player.tab.accessories')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <DataTab data={data} />
        </TabsContent>
        <TabsContent value="attributes">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {GROUPS.map(([title, keys]) => (
              <Section key={title} title={t(title)}>
                <div className="space-y-2.5">
                  {keys.map((k) => (
                    <Rating key={k} label={label(t, 'attr', k)} value={data.attributes[k]} />
                  ))}
                </div>
              </Section>
            ))}
            <Section title={t('attrGroup.other')}>
              <Facts
                items={['overall', 'potential', 'skill_moves', 'weak_foot', 'international_rep', 'attacking_work_rate', 'defensive_work_rate'].map((k) => [
                  label(t, 'attr', k),
                  data.attributes[k] ?? '—',
                ])}
              />
            </Section>
          </div>
        </TabsContent>
        <TabsContent value="traits">
          <Traits data={data} />
        </TabsContent>
        <TabsContent value="accessories">
          <div className="space-y-4">
            <CodeGroup title={t('fieldGroup.accessories')} codes={data.accessories} />
            <CodeGroup title={t('fieldGroup.animations')} codes={data.animations} />
          </div>
        </TabsContent>
        <TabsContent value="look">
          <LookTab data={data}>
            <Section title={t('section.appearanceCodes')}>
              <p className="mb-3 text-xs text-muted-foreground">{t('players.appearanceHint')}</p>
              <Facts items={Object.entries(data.appearance).map(([k, v]) => [<span key={k} className="font-mono text-xs">{k}</span>, v])} />
            </Section>
            <Section title={t('section.face')}>
              {data.face_files.length ? (
                <div className="space-y-1 font-mono text-xs">
                  {data.face_files.map((f) => (
                    <div key={f.path} className="flex justify-between gap-4 border-b border-dashed py-1">
                      <span className="truncate">{f.path}</span>
                      <Badge>{f.where ?? '—'}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('players.noFace')}</p>
              )}
            </Section>
          </LookTab>
        </TabsContent>
        <TabsContent value="raw">
          <Section title={t('section.rawRow', { table: 'players' })}>
            <RawTable raw={data.raw} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

const LOOK_MIN_HEIGHT = 360
const LOOK_BOTTOM_GAP = 16

/** Height that takes an element from where it starts to the end of the viewport (a small gap below it), as the
 * FIFA 14 Studio's Look tab. */
function useHeightToViewportEnd() {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setHeight(Math.max(LOOK_MIN_HEIGHT, window.innerHeight - ref.current.getBoundingClientRect().top - LOOK_BOTTOM_GAP))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return { ref, height }
}

/** The Look tab laid out as the FIFA 14 Studio's: the codes (`children`) in a column that scrolls on its own, the 3D
 * preview taking the free width and the photo on the right. */
function LookTab({ data, children }: { data: PlayerDetail; children: ReactNode }) {
  const { t } = useI18n()
  const column = useHeightToViewportEnd()
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div
        ref={column.ref}
        style={{ '--look-height': `${column.height}px` } as CSSProperties}
        className="order-3 w-[420px] max-w-full space-y-4 xl:order-1 xl:h-(--look-height) xl:shrink-0 xl:overflow-auto"
      >
        {children}
      </div>
      <PlayerPreview data={data} />
      <Card className="order-2 h-fit w-full max-w-56 shrink-0 gap-2 overflow-hidden py-0 xl:sticky xl:top-4 xl:order-3 xl:w-56">
        <div className="flex aspect-[3/4] items-center justify-center bg-muted">
          <Photo id={data.id} size={256} available={data.has_photo} className="size-full object-contain" />
        </div>
        <p className="px-4 pb-3 text-center text-xs text-muted-foreground">{data.has_photo ? t('look.photoReference') : t('look.noPhoto')}</p>
      </Card>
    </div>
  )
}

/** The player in 3D wearing the kit of his first team (the goalkeeper's for a goalkeeper), face first. */
function PlayerPreview({ data }: { data: PlayerDetail }) {
  const { t } = useI18n()
  const token = useToken()
  const look = useQuery({ queryKey: ['preview-look', token, data.id], queryFn: () => api.previewLook(data.id), enabled: !!token, staleTime: Infinity }).data
  const team = data.teams[0] ?? null
  const keeper = data.positions[0]?.code === 0
  const kit = previewKit(token, team?.id ?? null, keeper ? 2 : 0, {
    number: team?.jersey_number ?? (keeper ? 1 : 10),
    name: data.names.jersey || data.names.last || data.names.common,
  })
  return (
    // the 3D preview takes all the free width, pushing the photo to the right
    <Card className="order-1 h-fit min-w-0 flex-1 gap-2 overflow-hidden py-0 xl:sticky xl:top-4 xl:order-2">
      <Preview3D kit={kit} wearer={data.id} initialView="face" className="aspect-[3/4] max-h-[75vh] w-full bg-gradient-to-b from-muted to-background" />
      <div className="px-4 pb-3 text-center text-xs text-muted-foreground">
        <p>
          {team ? t('preview.wearsKit', { team: team.name ?? `#${team.id}` }) : t('preview.noTeam')}
          {!data.has_face && ` ${t('preview.genericFace')}`}
        </p>
        {look?.generic_in_game && <p className="text-amber-700 dark:text-amber-300">{t('preview.genericInGame')}</p>}
      </div>
    </Card>
  )
}

/** The player's traits, read only: the ones he has stand out (same groups as the FIFA 14 Studio). */
function Traits({ data }: { data: PlayerDetail }) {
  const { t } = useI18n()
  const groups: [MessageKey, string[]][] = [
    ['traits.general', data.all_traits.filter((k) => !GOALKEEPER_TRAITS.includes(k) && !SKILL_TRAITS.includes(k))],
    ['traits.skills', data.all_traits.filter((k) => SKILL_TRAITS.includes(k))],
    ['traits.goalkeeper', data.all_traits.filter((k) => GOALKEEPER_TRAITS.includes(k))],
  ]
  return (
    <Section title={`${t('traits.title')} · ${t('traits.count', { count: data.traits.length })}`}>
      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map(([title, keys]) => (
          <div key={title} className="space-y-1.5">
            <h3 className="border-b pb-1 text-sm font-semibold text-muted-foreground">{t(title)}</h3>
            {keys.map((key) => {
              const on = data.traits.includes(key)
              return (
                <div key={key} className={cn('flex items-center gap-2 text-sm', !on && 'text-muted-foreground/60')}>
                  {on ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Minus className="size-4" />}
                  <span className={on ? 'font-medium' : undefined}>{label(t, 'trait', key)}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Section>
  )
}

/** The codes of one group (accessories, animations), read-only, laid out as the FIFA 14 Studio's. */
function CodeGroup({ title, codes }: { title: string; codes: Record<string, number> }) {
  const { t } = useI18n()
  return (
    <Section title={title} description={t('players.codesHint')}>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(codes).map(([k, v]) => (
          <div key={k} className="grid gap-1.5">
            <p className="text-sm font-medium">{label(t, 'field', k)}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{v}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** A field's label with its hint under it (as the FIFA 14 Studio's form shows them). */
function FieldLabel({ name }: { name: string }) {
  const { t } = useI18n()
  const hint = `field.${name}.hint`
  return (
    <span>
      {label(t, 'field', name)}
      {hasMessage(hint) && <span className="block text-xs text-muted-foreground">{t(hint as MessageKey)}</span>}
    </span>
  )
}

const stars = (n: number | undefined) => (n === undefined || n === null ? '—' : `${n} ★`)

function DataTab({ data }: { data: PlayerDetail }) {
  const { t } = useI18n()
  const op = useBasketOp()
  const pick = (team: number, on: boolean) => op.mutate({ op: 'pick', args: { team, player: data.id, on } })
  const a = data.attributes
  const position = (i: number) => data.positions[i]?.name ?? '—'
  const facts = (rows: [string, ReactNode][]) => <Facts items={rows.map(([name, value]) => [<FieldLabel key={name} name={name} />, value])} />
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Section title={t('fieldGroup.names')}>
            {facts([
              ['name.first', data.names.first || '—'],
              ['name.last', data.names.last || '—'],
              ['name.common', data.names.common || '—'],
              ['name.jersey', data.names.jersey || '—'],
            ])}
          </Section>
          <Section title={t('fieldGroup.info')}>
            {facts([
              [
                'birthdate',
                data.birthdate ? (
                  <span key="b">
                    {data.birthdate} {data.birthdate_suspect ? <Badge tone="warn">{t('players.birthdateSuspect')}</Badge> : data.age !== null && `(${t('players.ageYears', { age: data.age })})`}
                  </span>
                ) : (
                  '—'
                ),
              ],
              ['height', data.height ?? '—'],
              ['weight', data.weight ?? '—'],
              ['preferredfoot', data.preferred_foot ? t(`foot.${data.preferred_foot}`) : '—'],
              [
                'nationality',
                <span key="n" className="inline-flex items-center gap-2">
                  <Flag id={data.nationality_id} className="h-3.5 w-5" />
                  {data.nationality_id !== null && data.nationality ? (
                    <Link to={`/nations/${data.nationality_id}`} className="hover:underline">
                      {data.nationality}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>,
              ],
            ])}
          </Section>
        </div>
        <Section title={t('photo.title')} description={t('players.photoFromHint', { where: data.photo_where ?? '—' })}>
          <div className="mx-auto flex size-40 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
            <Photo id={data.id} size={256} available={data.has_photo} className="size-full object-contain" />
          </div>
        </Section>
      </div>
      <Section title={t('section.teamsOfPlayer')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              {/* the team takes the free width, pushing No. and position to the right (as the FIFA 14 Studio's) */}
              <TableHead>{t('col.team')}</TableHead>
              <TableHead className="w-28 text-center">{t('col.number')}</TableHead>
              <TableHead className="w-28 text-center">{t('col.position')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.teams.map((tm) => (
              <TableRow key={tm.id}>
                <TableCell>
                  <BasketCheck checked={tm.picked} disabled={op.isPending} label={t('players.pickInTeam')} onChange={(v) => pick(tm.id, v)} />
                </TableCell>
                <TableCell>
                  <Link to={`/teams/${tm.id}?tab=roster`} className="font-medium hover:underline">
                    {tm.name ?? `#${tm.id}`}
                  </Link>
                </TableCell>
                <TableCell className="text-center tabular-nums">{tm.jersey_number ?? '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge>{tm.position_name ?? tm.position ?? '—'}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">{t('players.pickInTeamHint')}</p>
        {data.standalone && <p className="mt-1 text-xs text-muted-foreground">{t('players.standaloneHint')}</p>}
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('fieldGroup.positions')}>
          {facts([
            ['preferredposition1', position(0)],
            ['preferredposition2', position(1)],
            ['preferredposition3', position(2)],
            ['preferredposition4', position(3)],
          ])}
        </Section>
        <Section title={t('fieldGroup.style')}>
          {facts([
            ['potential', a.potential ?? '—'],
            ['skillmoves', stars(a.skill_moves === undefined ? undefined : a.skill_moves + 1)],
            ['weakfootabilitytypecode', stars(a.weak_foot)],
            ['internationalrep', stars(a.international_rep)],
            ['attackingworkrate', a.attacking_work_rate ?? '—'],
            ['defensiveworkrate', a.defensive_work_rate ?? '—'],
          ])}
        </Section>
        <Section title={t('fieldGroup.career')}>
          {facts([
            ['contractvaliduntil', data.career.contract_until ?? '—'],
            ['playerjointeamdate', data.career.joined ?? '—'],
            ['isretiring', data.career.retiring ? t('common.yes') : t('common.no')],
          ])}
        </Section>
      </div>
    </div>
  )
}
