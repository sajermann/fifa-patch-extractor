import { useQuery } from '@tanstack/react-query'
import { ScanFace } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import type { PlayerDetail } from '@/api/types'
import { BackButton, Badge, BasketButton, BasketCheck, Facts, OverallBadge, Rating, RawTable, Section } from '@/components/common/detail'
import { Flag, Photo } from '@/components/common/pictures'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { useBasketOp, useToken } from '@/state/queries'
import { NameList } from './TeamPage'

const TABS = ['overview', 'attributes', 'appearance', 'raw'] as const

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
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  return (
    <div className="space-y-6">
      <BackButton fallback="/players" />
      <div className="flex flex-wrap items-center gap-5">
        <Photo id={id} size={256} available={data.has_photo} className="size-24 rounded-lg bg-muted/40" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {data.name}
            {data.has_face && (
              <span title={t('players.hasFace')}>
                <ScanFace className="size-5 text-emerald-600 dark:text-emerald-400" />
              </span>
            )}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <OverallBadge value={data.overall} />
            {data.positions.map((p) => p.name).join(' / ')}
            <span>·</span>
            <Flag id={data.nationality_id} className="h-3.5 w-5" /> {data.nationality ?? '—'}
            <span>·</span>#{data.id}
          </p>
        </div>
        <BasketButton
          inside={data.in_basket}
          busy={op.isPending}
          onToggle={() => op.mutate({ op: data.in_basket ? 'remove_players' : 'add_players', args: { ids: [id] } })}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('tab.overview')}</TabsTrigger>
          <TabsTrigger value="attributes">{t('tab.attributes')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('tab.appearance')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview data={data} />
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
        <TabsContent value="appearance">
          <div className="grid gap-6 lg:grid-cols-2">
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
          </div>
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

function Overview({ data }: { data: PlayerDetail }) {
  const { t } = useI18n()
  const op = useBasketOp()
  const pick = (team: number, on: boolean) => op.mutate({ op: 'pick', args: { team, player: data.id, on } })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('section.names')}>
        <NameList names={data.names} prefix="playerName" />
      </Section>
      <Section title={t('section.details')}>
        <Facts
          items={[
            [
              t('players.birthdate'),
              data.birthdate ? (
                <span key="b">
                  {data.birthdate} {data.birthdate_suspect ? <Badge tone="warn">{t('players.birthdateSuspect')}</Badge> : data.age !== null && `(${t('players.ageYears', { age: data.age })})`}
                </span>
              ) : (
                '—'
              ),
            ],
            [t('players.height'), data.height ? `${data.height} cm` : '—'],
            [t('players.weight'), data.weight ? `${data.weight} kg` : '—'],
            [t('players.foot'), data.preferred_foot ? t(`foot.${data.preferred_foot}`) : '—'],
            [t('players.positions'), data.positions.map((p) => p.name).join(', ') || '—'],
            [t('players.photoFrom'), data.photo_where ?? '—'],
            [t('players.standalone'), data.standalone ? t('common.yes') : t('common.no')],
          ]}
        />
      </Section>
      <Section title={t('section.teamsOfPlayer')} className="lg:col-span-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t('col.team')}</TableHead>
              <TableHead>{t('col.number')}</TableHead>
              <TableHead>{t('col.inTeam')}</TableHead>
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
                <TableCell className="tabular-nums">{tm.jersey_number ?? '—'}</TableCell>
                <TableCell>
                  <Badge>{tm.position_name ?? tm.position ?? '—'}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">{t('players.pickInTeamHint')}</p>
      </Section>
    </div>
  )
}
