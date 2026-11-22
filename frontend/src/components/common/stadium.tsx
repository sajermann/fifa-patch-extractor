import { Box, ChevronUp, LoaderCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { StadiumInfo } from '@/api/types'
import { Badge, Facts, RawTable, Section } from '@/components/common/detail'
import { StadiumImage } from '@/components/common/pictures'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

const StadiumPreview = lazy(() => import('@/components/common/StadiumPreview')) // three.js only loads when asked

/** The stadium in 3D, built only when asked (a big stadium is tens of MB and takes seconds); `open` lives in the page,
 * which gives it half of the height when open. */
export function Stadium3D({ stadium, open, setOpen, className }: { stadium: StadiumInfo; open: boolean; setOpen: (v: boolean) => void; className?: string }) {
  const { t } = useI18n()
  return (
    <Section
      scroll={open}
      className={className}
      title={t('stadium3d.title')}
      action={
        stadium.times.length > 0 &&
        (open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            <ChevronUp /> {t('stadium3d.close')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Box /> {t('preview.show3d')}
          </Button>
        ))
      }
    >
      {!stadium.times.length ? (
        <p className="text-sm text-muted-foreground">{t('stadium3d.none')}</p>
      ) : open ? (
        <div className="flex h-full min-h-48 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-muted">
            <Suspense
              fallback={
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <LoaderCircle className="size-6 animate-spin" />
                </div>
              }
            >
              <StadiumPreview id={stadium.id} times={stadium.times} />
            </Suspense>
          </div>
          <p className="text-xs text-muted-foreground">{t('stadium3d.hint')}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('stadium3d.ask')}</p>
      )}
    </Section>
  )
}

/** Data of the stadium on top, its menu pictures below one another (a click opens them big). */
export function StadiumDetails({ stadium: s, customName, title, className, scroll }: { stadium: StadiumInfo; customName?: string | null; title?: string; className?: string; scroll?: boolean }) {
  const { t } = useI18n()
  return (
    <Section scroll={scroll} className={className} title={title ?? t('section.stadium', { name: s.name })}>
      <Facts
        items={[
          ...Object.entries(s.names).map(([k, v]) => [hasMessage(`stadiumName.${k}`) ? t(`stadiumName.${k}` as MessageKey) : k, v] as [string, React.ReactNode]),
          ...(customName ? [[t('stadium.customName'), customName] as [string, React.ReactNode]] : []),
          [t('stadium.capacity'), s.capacity?.toLocaleString() ?? '—'],
          [t('stadium.yearBuilt'), s.year_built || '—'],
          [t('col.country'), s.country_id !== null && s.country ? <Link key="c" to={`/nations/${s.country_id}`} className="hover:underline">{s.country}</Link> : '—'],
          [t('stadium.homeTeam'), s.home_team ? <Link key="h" to={`/teams/${s.home_team.id}`} className="hover:underline">{s.home_team.name}</Link> : t('stadium.noHomeTeam')],
          [t('stadium.teamCount'), s.team_count],
          [t('col.id'), <Link key="i" to={`/stadiums/${s.id}`} className="hover:underline">{s.id}</Link>],
        ]}
      />
      <div className="mt-4 space-y-3">
        {s.pictures.length ? (
          s.pictures.map((v) => (
            <figure key={v} className="space-y-1">
              <StadiumImage id={s.id} variant={v} size={512} className="aspect-[981/278] w-full rounded border bg-muted/40" />
              <figcaption className="text-xs text-muted-foreground">{t('stadium.picture', { variant: v })}</figcaption>
            </figure>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t('stadium.noPictures')}</p>
        )}
      </div>
    </Section>
  )
}

/** The files of the stadium and its database row (for whoever needs them; not the center of the screen). */
export function StadiumDatabase({ stadium: s, className }: { stadium: StadiumInfo; className?: string }) {
  const { t } = useI18n()
  return (
    <div className={cn('grid items-start gap-6 xl:grid-cols-2', className)}>
      <Section title={t('stadium.files', { count: s.files.length })}>
        <p className="mb-3 text-xs text-muted-foreground">{t('stadium.filesHint')}</p>
        <ul className="space-y-1 text-xs">
          {s.files.map((f) => (
            <li key={f.path} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              <Badge>{f.where ?? '—'}</Badge>
            </li>
          ))}
          {!s.files.length && <li className="text-muted-foreground">{t('stadium.noFiles')}</li>}
        </ul>
      </Section>
      <Section title={t('section.rawRow', { table: 'stadiums' })}>
        <RawTable raw={s.raw} />
      </Section>
    </div>
  )
}
