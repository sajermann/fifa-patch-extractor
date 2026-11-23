import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/api/client'
import { BasketButton, Section } from '@/components/common/detail'
import { Crest, StadiumImage } from '@/components/common/pictures'
import { LanguageNames } from '@/components/common/names'
import { Stadium3D, StadiumDatabase, StadiumDetails, StadiumFields } from '@/components/common/stadium'
import { LoadingBlock } from '@/components/layout/LoadingBlock'
import { useI18n } from '@/i18n'
import { BackButton, usePageLabel } from '@/lib/back'
import { useTab } from '@/lib/tabs'
import { cn } from '@/lib/utils'
import { useBasketOp, useToken } from '@/state/queries'

const TABS = ['overview', 'data', 'raw'] as const

/** One stadium. The page never scrolls: its boxes take the height left (half each with the 3D open) and scroll
 * inside. */
export function StadiumPage() {
  const { t } = useI18n()
  const id = Number(useParams().id)
  const token = useToken()
  const navigate = useNavigate()
  const { data, error } = useQuery({ queryKey: ['stadium', token, id], queryFn: () => api.stadium(id), enabled: !!token })
  usePageLabel(data?.name)
  const op = useBasketOp()
  const [tab, setTab] = useTab(TABS)
  const [open3d, setOpen3d] = useState(false)
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
        <TabsContent value="overview" className="flex min-h-0 flex-1 flex-col gap-4">
          <Stadium3D stadium={data.detail} open={open3d} setOpen={setOpen3d} className={open3d ? 'min-h-0 flex-1' : 'shrink-0'} />
          <div className={cn('grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
            <StadiumDetails stadium={data.detail} title={t('section.details')} scroll className="h-full" />
            <Section scroll className="h-full" title={t('stadiums.teams', { count: data.teams.length })}>
              {data.teams.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{t('col.name')}</TableHead>
                      <TableHead>{t('col.league')}</TableHead>
                      <TableHead>{t('col.customName')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.teams.map((tm) => (
                      <TableRow key={tm.id} className="cursor-pointer" onClick={() => navigate(`/teams/${tm.id}?tab=stadium`)}>
                        <TableCell>
                          <Crest id={tm.id} size={64} available={tm.has_crest} className="size-7" />
                        </TableCell>
                        <TableCell className="font-medium">{tm.name}</TableCell>
                        <TableCell>{tm.league ?? '—'}</TableCell>
                        <TableCell>{tm.stadium_custom_name ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">{t('stadiums.noTeams')}</p>
              )}
            </Section>
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
