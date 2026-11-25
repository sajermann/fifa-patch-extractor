import { useQuery } from '@tanstack/react-query'
import { Flag as FlagIcon } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { Badge, Facts, RawTable, Section } from '@/components/common/detail'
import { Flag, LeagueImage } from '@/components/common/pictures'
import { LanguageNames } from '@/components/common/names'
import { DetailSelect, RowSelect, SelectAllHead, useTreeOp } from '@/components/common/selectionTree'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { useToken } from '@/state/queries'
import { useConfederationName } from './NationsPage'
import { BackButton, usePageLabel } from '@/lib/back'

const TABS = ['overview', 'leagues', 'raw'] as const


export function NationPage() {
  const { t } = useI18n()
  const tree = useTreeOp()
  const id = Number(useParams().id)
  const token = useToken()
  const navigate = useNavigate()
  const { data, error } = useQuery({ queryKey: ['nation', token, id], queryFn: () => api.nation(id), enabled: !!token })
  usePageLabel(data?.name)
  const confederation = useConfederationName()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  return (
    <div className="space-y-4">
      <BackButton fallback={{ to: '/nations', label: t('nav.nations') }} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Flag id={id} size={256} available={data.has_flag} className="h-16 w-24 shrink-0" fallback={<FlagIcon className="size-8" />} />
          <h1 className="min-w-0 text-2xl font-semibold break-words">{data.name}</h1>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">ID {data.id}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{confederation(data.confederation)}</span>
        </div>
        <DetailSelect row={data} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('tab.overview')}</TabsTrigger>
          <TabsTrigger value="leagues">{t('section.leaguesCount', { count: data.leagues.length })}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t('section.details')}>
              <Facts
                items={[
                  [t('nationName.database'), data.names.database ?? '—'],
                  [t('col.confederation'), confederation(data.confederation)],
                  [t('nations.nationalTeam'), data.national_team ? <Link key="n" to={`/teams/${data.national_team.id}`} className="hover:underline">{data.national_team.name}</Link> : '—'],
                  [t('col.players'), data.player_count],
                  [t('nations.topTier'), data.top_tier ?? '—'],
                ]}
              />
            </Section>
            <Section title={t('nations.flag')}>
              <div className="flex flex-wrap items-start gap-6">
                <Flag id={id} size={512} available={data.has_flag} className="h-32 w-48 rounded border bg-muted/40" fallback={<FlagIcon className="size-8" />} />
                <ul className="min-w-0 flex-1 space-y-1 text-xs">
                  {data.flag_files.map((f) => (
                    <li key={f.path} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                      <Badge>{f.where ?? '—'}</Badge>
                    </li>
                  ))}
                  {!data.flag_files.length && <li className="text-muted-foreground">{t('nations.noFlag')}</li>}
                </ul>
              </div>
            </Section>
            <Section title={t('nations.audio')}>
              {data.audio ? (
                <Facts
                  items={Object.entries(data.audio)
                    .filter(([k]) => k !== 'nationid')
                    .map(([k, v]) => {
                      const key = `audio.${k}`
                      return [hasMessage(key) ? t(key as MessageKey) : k, v ?? '—'] as [string, React.ReactNode]
                    })}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('nations.noAudio')}</p>
              )}
            </Section>
          </div>
          <Section title={t('section.names')}>
            <div className="max-h-96 overflow-auto">
              <LanguageNames columns={[...data.name_keys].reverse()} prefix="nationName" names={data.language_names} />
            </div>
          </Section>
        </TabsContent>
        <TabsContent value="leagues">
          <Section title={t('section.leaguesCount', { count: data.leagues.length })}>
            {data.leagues.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAllHead rows={data.leagues} total={data.leagues.length} onPick={(ids, on) => tree.setMany(ids.map((i) => `league:${i}`), on ? 'all' : 'none')} />
                    </TableHead>
                    <TableHead className="w-10 min-w-12" />
                    <TableHead className="w-full">{t('col.name')}</TableHead>
                    <TableHead className="text-right">{t('col.level')}</TableHead>
                    <TableHead className="text-center">{t('col.teams')}</TableHead>
                    <TableHead className="text-center">{t('col.adboards')}</TableHead>
                    <TableHead className="text-left">{t('col.id')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leagues.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leagues/${l.id}`)}>
                      <TableCell>
                        <RowSelect row={l} />
                      </TableCell>
                      <TableCell>
                        <LeagueImage id={l.id} size={64} available={l.has_logo} className="size-7 shrink-0" />
                      </TableCell>
                      <TableCell>
                        <Link to={`/leagues/${l.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {l.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.level ?? '—'}</TableCell>
                      <TableCell className="text-center tabular-nums">{l.team_count}</TableCell>
                      <TableCell className="text-center tabular-nums">{l.adboard_count || '—'}</TableCell>
                      <TableCell className="text-left text-muted-foreground tabular-nums">{l.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('nations.noLeagues')}</p>
            )}
          </Section>
        </TabsContent>
        <TabsContent value="raw" className="space-y-4">
          <Section title={t('section.rawRow', { table: 'nations' })}>
            <RawTable raw={data.raw} />
          </Section>
          {data.audio && (
            <Section title={t('section.rawRow', { table: 'audionation' })}>
              <RawTable raw={data.audio} />
            </Section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
