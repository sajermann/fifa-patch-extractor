import { useQuery } from '@tanstack/react-query'
import { Flag as FlagIcon } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { Facts, OverallBadge, RawTable, Section } from '@/components/common/detail'
import { LanguageNames } from '@/components/common/names'
import { AdboardFiles, Crest, Flag, LeagueImage } from '@/components/common/pictures'
import { DetailSelect, PartToggle, RowSelect, SelectAllHead, useTreeOp } from '@/components/common/selectionTree'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { useI18n } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { useToken } from '@/state/queries'
import { BackButton, usePageLabel } from '@/lib/back'
import { useConfederationName } from './NationsPage'

const TABS = ['data', 'countries', 'teams', 'adboards', 'raw'] as const
// the name columns in the FIFA 14 Studio's order (short ones first)
const NAME_COLUMNS = ['abbr', 'abbr15', 'full', 'trophy_abbr15', 'trophy']

/** One league, with the same header and tabs as the FIFA 14 Studio's league screen (without the editing). The page
 * never scrolls: each box takes the height left and scrolls inside. */
export function LeaguePage() {
  const { t } = useI18n()
  const tree = useTreeOp()
  const id = Number(useParams().id)
  const token = useToken()
  const navigate = useNavigate()
  const { data, error } = useQuery({ queryKey: ['league', token, id], queryFn: () => api.league(id), enabled: !!token })
  usePageLabel(data?.name)
  const confederation = useConfederationName()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  const country = data.country_row
  return (
    <div className="flex h-full min-h-[32rem] flex-col gap-4">
      <BackButton fallback={{ to: '/leagues', label: t('nav.leagues') }} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <LeagueImage id={id} size={128} available={data.images.includes('logo')} className="size-20 shrink-0" />
          <h1 className="min-w-0 text-2xl font-semibold break-words">{data.name}</h1>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {data.country_id !== null && data.country && (
              <>
                <Link to={`/nations/${data.country_id}`} className="hover:underline">
                  {data.country}
                </Link>
                {' · '}
              </>
            )}
            {[data.level !== null ? t('leagues.level', { level: data.level }) : null, `ID ${data.id}`].filter(Boolean).join(' · ')}
          </span>
        </div>
        <DetailSelect row={data} />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="data">{t('tab.data')}</TabsTrigger>
          <TabsTrigger value="countries">{t('section.countriesCount', { count: country ? 1 : 0 })}</TabsTrigger>
          <TabsTrigger value="teams">{t('section.teamsCount', { count: data.teams.length })}</TabsTrigger>
          <TabsTrigger value="adboards">
            {t('tab.adboard')} ({data.adboards.length})
          </TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="data" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid shrink-0 gap-4 lg:grid-cols-2">
            <Section title={t('section.details')}>
              <Facts
                items={[
                  [t('leagueName.database'), data.names.database ?? '—'],
                  [t('col.country'), data.country_id !== null && data.country ? <Link key="c" to={`/nations/${data.country_id}`} className="hover:underline">{data.country}</Link> : '—'],
                  [t('col.level'), data.level ?? '—'],
                  [t('col.teams'), data.teams.length],
                ]}
              />
            </Section>
            <Section title={t('section.images')}>
              <Facts
                items={[
                  [t('leagues.logo'), <LeagueImage key="l" id={id} size={256} available={data.images.includes('logo')} className="size-24" />],
                  [t('leagues.banner'), data.images.includes('banner') ? <LeagueImage key="b" id={id} kind="banner" className="h-16" /> : '—'],
                ]}
              />
            </Section>
          </div>
          <Section scroll title={t('section.names')} className="min-h-48 flex-1">
            <LanguageNames columns={NAME_COLUMNS} prefix="leagueName" names={data.language_names} />
          </Section>
        </TabsContent>
        <TabsContent value="countries" className="flex min-h-0 flex-1 flex-col">
          <Section scroll title={t('section.countriesCount', { count: country ? 1 : 0 })} className="min-h-0 flex-1">
            {country ? (
              <Table>
                <TableHeader className="sticky top-0 z-10 shadow-[0_1px_0_var(--border)] [&_th]:bg-card">
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAllHead rows={[country]} total={1} onPick={(ids, on) => tree.setMany(ids.map((i) => `nation:${i}`), on ? 'all' : 'none')} />
                    </TableHead>
                    <TableHead className="w-12 min-w-12" />
                    <TableHead className="w-full">{t('col.name')}</TableHead>
                    <TableHead className="text-right">{t('col.confederation')}</TableHead>
                    <TableHead className="w-28 text-center">{t('col.leagues')}</TableHead>
                    <TableHead className="w-28">{t('col.id')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="cursor-pointer" onClick={() => navigate(`/nations/${country.id}`)}>
                    <TableCell>
                      <RowSelect row={country} />
                    </TableCell>
                    <TableCell>
                      <Flag id={country.id} size={64} available={country.has_flag} className="h-5 w-8" fallback={<FlagIcon className="size-4" />} />
                    </TableCell>
                    <TableCell className="font-medium">{country.name}</TableCell>
                    <TableCell className="text-right">{confederation(country.confederation)}</TableCell>
                    <TableCell className="text-center tabular-nums">{country.league_count}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{country.id}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('leagues.noCountry')}</p>
            )}
          </Section>
        </TabsContent>
        <TabsContent value="teams" className="flex min-h-0 flex-1 flex-col">
          <Section scroll title={t('section.teamsCount', { count: data.teams.length })} className="min-h-0 flex-1">
            <Table>
              <TableHeader className="sticky top-0 z-10 shadow-[0_1px_0_var(--border)] [&_th]:bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <SelectAllHead rows={data.teams} total={data.teams.length} onPick={(ids, on) => tree.setMany(ids.map((i) => `team:${i}`), on ? 'all' : 'none')} />
                  </TableHead>
                  <TableHead className="w-10 min-w-10" />
                  <TableHead className="w-full">{t('col.name')}</TableHead>
                  <TableHead className="w-28 text-center">{t('col.overall')}</TableHead>
                  <TableHead className="w-28 text-center">{t('col.players')}</TableHead>
                  <TableHead className="w-28 text-center">{t('col.kits')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.teams.map((tm) => (
                  <TableRow key={tm.id} className="cursor-pointer" onClick={() => navigate(`/teams/${tm.id}`)}>
                    <TableCell>
                      <RowSelect row={tm} />
                    </TableCell>
                    <TableCell>
                      <Crest id={tm.id} size={64} available={tm.has_crest} className="size-7 shrink-0" />
                    </TableCell>
                    <TableCell>
                      <Link to={`/teams/${tm.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {tm.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <OverallBadge value={tm.overall} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{tm.player_count}</TableCell>
                    <TableCell className="text-center tabular-nums">{tm.kit_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
        <TabsContent value="adboards">
          <Section
            title={t('adboard.title')}
            description={t('adboard.leagueFiles')}
            action={<PartToggle nodeKey={`leagueboards:${data.id}`} state={data.basket_boards} label={t('part.inPackage')} />}
          >
            {data.adboards.length ? <AdboardFiles names={data.adboards.map((b) => b.name)} /> : <p className="text-sm text-muted-foreground">{t('adboard.none')}</p>}
          </Section>
        </TabsContent>
        <TabsContent value="raw" className="flex min-h-0 flex-1 flex-col">
          <Section scroll title={t('section.rawRow', { table: 'leagues' })} className="min-h-0 flex-1">
            <RawTable raw={data.raw} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
