import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import { BasketButton, Section } from '@/components/common/detail'
import { Crest, StadiumImage } from '@/components/common/pictures'
import { LanguageNames } from '@/components/common/names'
import { RowSelect, SelectAllHead, useTreeOp } from '@/components/common/selectionTree'
import { Stadium3D, StadiumDatabase, StadiumDetails, StadiumFields } from '@/components/common/stadium'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { useI18n } from '@/i18n'
import { BackButton, usePageLabel } from '@/lib/back'
import { useTab } from '@/lib/tabs'
import { useBasketOp, useToken } from '@/state/queries'

const TABS = ['overview', 'data', 'raw'] as const

/** One stadium. The Overview tab is laid out as the FIFA 14 Studio's: the data and pictures on top, then the teams
 * that play there beside the 3D (always open). */
export function StadiumPage() {
  const { t } = useI18n()
  const id = Number(useParams().id)
  const token = useToken()
  const { data, error } = useQuery({ queryKey: ['stadium', token, id], queryFn: () => api.stadium(id), enabled: !!token })
  usePageLabel(data?.name)
  const op = useBasketOp()
  const tree = useTreeOp()
  const [tab, setTab] = useTab(TABS)
  if (error) return <p className="text-destructive">{error.message}</p>
  if (!data) return <LoadingBlock />
  return (
    <div className="flex h-full min-h-[32rem] flex-col gap-4">
      <BackButton fallback={{ to: '/stadiums', label: t('nav.stadiums') }} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* the picture, then the name with its country and ID on one line (as the FIFA 14 Studio) */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {data.detail.pictures.length ? (
            <StadiumImage id={data.id} variant={data.detail.pictures[0]} size={256} className="h-24 w-[150px] shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="inline-flex h-24 w-[150px] shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground/50">
              <Landmark className="size-6" />
            </span>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-2xl font-semibold break-words">{data.name}</h1>
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {data.detail.country_id !== null && data.detail.country && (
                <>
                  <Link to={`/nations/${data.detail.country_id}`} className="hover:underline">
                    {data.detail.country}
                  </Link>
                  {' · '}
                </>
              )}
              ID {data.id}
            </span>
          </div>
        </div>
        <BasketButton
          inside={data.in_basket}
          busy={op.isPending}
          onToggle={() => op.mutate({ op: data.in_basket ? 'remove_stadium' : 'add_stadium', args: { id } })}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="overview">{t('tab.overview')}</TabsTrigger>
          <TabsTrigger value="data">{t('tab.data')}</TabsTrigger>
          <TabsTrigger value="raw">{t('tab.raw')}</TabsTrigger>
        </TabsList>
        {/* as the FIFA 14 Studio: the data and pictures on top, then the teams beside the 3D (always open) */}
        <TabsContent value="overview" className="min-h-0 flex-1 space-y-4 overflow-auto">
          <StadiumDetails stadium={data.detail} title={t('section.details')} grid />
          <div className="grid gap-4 lg:h-[70vh] lg:grid-cols-2">
            <Section scroll className="max-h-[70vh] lg:h-full lg:max-h-none" title={t('stadiums.teams', { count: data.teams.length })}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAllHead rows={data.teams} total={data.teams.length} onPick={(ids, on) => tree.setMany(ids.map((i) => `team:${i}`), on ? 'all' : 'none')} />
                    </TableHead>
                    <TableHead className="w-full">{t('col.name')}</TableHead>
                    <TableHead className="text-right">{t('col.customName')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.teams.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        {t('stadiums.noTeams')}
                      </TableCell>
                    </TableRow>
                  )}
                  {data.teams.map((tm) => (
                    <TableRow key={tm.id}>
                      <TableCell>
                        <RowSelect row={tm} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Crest id={tm.id} size={64} available={tm.has_crest} className="size-7 shrink-0" />
                          <Link to={`/teams/${tm.id}?tab=stadium`} className="font-medium text-foreground underline-offset-4 hover:underline">
                            {tm.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{tm.stadium_custom_name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
            <Stadium3D stadium={data.detail} open className="h-[70vh] lg:h-full" />
          </div>
        </TabsContent>
        <TabsContent value="data" className="min-h-0 flex-1 space-y-4 overflow-auto">
          <Section title={t('section.names')}>
            <LanguageNames columns={data.name_keys} prefix="stadiumName" names={data.language_names} />
          </Section>
          <StadiumFields stadium={data.detail} />
        </TabsContent>
        <TabsContent value="raw" className="min-h-0 flex-1 overflow-auto">
          <StadiumDatabase stadium={data.detail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
