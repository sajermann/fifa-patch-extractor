import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { BackButton, BasketButton, BasketCheck, Facts, OverallBadge, RawTable, Section } from '@/components/common/detail'
import { Crest, Flag, LeagueImage } from '@/components/common/pictures'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { useI18n } from '@/i18n'
import { useTab } from '@/lib/tabs'
import { useBasketOp, useToken } from '@/state/queries'
import { NameList } from './TeamPage'

const TABS = ['overview', 'raw'] as const

export function LeaguePage() {
  const { t } = useI18n()
  const id = Number(useParams().id)
  const token = useToken()
  const navigate = useNavigate()
  const { data, error } = useQuery({ queryKey: ['league', token, id], queryFn: () => api.league(id), enabled: !!token })
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  return (
    <div className="space-y-6">
      <BackButton fallback="/leagues" />
      <div className="flex flex-wrap items-center gap-5">
        <LeagueImage id={id} size={128} available={data.images.includes('logo')} className="size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag id={data.country_id} className="h-3.5 w-5" />
            {[data.country, data.level !== null ? t('leagues.level', { level: data.level }) : null, `#${data.id}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <BasketButton
          inside={data.in_basket}
          busy={op.isPending}
          labels={{ add: t('leagues.addWithTeams'), remove: t('basket.remove') }}
          onToggle={() => op.mutate({ op: data.in_basket ? 'remove_league' : 'add_league', args: { id } })}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('tab.overview')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t('section.names')}>
              <NameList names={data.names} prefix="leagueName" />
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
          <Section title={t('section.teamsCount', { count: data.teams.length })}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-10" />
                  <TableHead>{t('col.name')}</TableHead>
                  <TableHead>{t('col.overall')}</TableHead>
                  <TableHead>{t('col.players')}</TableHead>
                  <TableHead>{t('col.kits')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.teams.map((tm) => (
                  <TableRow key={tm.id} className="cursor-pointer" onClick={() => navigate(`/teams/${tm.id}`)}>
                    <TableCell>
                      <BasketCheck
                        checked={tm.in_basket}
                        label={tm.in_basket ? t('basket.remove') : t('basket.add')}
                        onChange={(v) => op.mutate({ op: v ? 'add_team' : 'remove_team', args: { id: tm.id } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Crest id={tm.id} size={64} available={tm.has_crest} className="size-7" />
                    </TableCell>
                    <TableCell>
                      <Link to={`/teams/${tm.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {tm.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <OverallBadge value={tm.overall} />
                    </TableCell>
                    <TableCell className="tabular-nums">{tm.player_count}</TableCell>
                    <TableCell className="tabular-nums">{tm.kit_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
        <TabsContent value="raw">
          <Section title={t('section.rawRow', { table: 'leagues' })}>
            <RawTable raw={data.raw} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
