import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/api/client'
import { Facts, Section } from '@/components/common/detail'
import { useI18n } from '@/i18n'
import { useStatus } from '@/state/queries'

export function SourcePage() {
  const { t } = useI18n()
  const status = useStatus().data
  const qc = useQueryClient()
  const [path, setPath] = useState('')
  const source = status?.source
  const load = useMutation({
    mutationFn: (p: string) => api.loadSource(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status'] }),
    onError: (e: Error) => toast.error(e.message),
  })
  const browse = async () => {
    try {
      const r = await api.pickFolder(path || status?.config.source_dir, t('source.pickTitle'))
      if (r.path) {
        setPath(r.path)
        load.mutate(r.path)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const forget = async (p: string) => {
    await api.forgetRecent(p)
    void qc.invalidateQueries({ queryKey: ['status'] })
  }
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('source.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('source.subtitle')}</p>
      </div>
      <Section title={t('source.folder')}>
        <div className="flex flex-wrap gap-2">
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder={t('source.placeholder')} className="min-w-72 flex-1" />
          <Button variant="outline" onClick={browse}>
            <FolderOpen /> {t('source.browse')}
          </Button>
          <Button disabled={!path.trim() || source?.state === 'loading'} onClick={() => load.mutate(path.trim())}>
            {t('source.open')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('source.readOnly')}</p>
        {!!status?.config.recent_sources.length && (
          <div className="mt-4 space-y-1">
            <p className="text-sm font-medium">{t('source.recent')}</p>
            {status.config.recent_sources.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <Button variant="link" className="h-auto p-0 font-mono text-xs" disabled={source?.state === 'loading'} onClick={() => load.mutate(p)}>
                  {p}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t('source.forget')} title={t('source.forget')} onClick={() => forget(p)}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
      {source && source.state !== 'empty' && (
        <Section title={t('source.current')}>
          {source.state === 'loading' && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> {t('source.loading', { path: source.path ?? '' })}
            </p>
          )}
          {source.state === 'error' && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t('source.error', { error: source.error ?? '' })}
            </p>
          )}
          {source.state === 'ready' && source.counts && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> {t('source.ready')}
              </p>
              <Facts
                items={[
                  [t('source.gameDir'), <span key="g" className="font-mono text-xs">{source.game_dir}</span>],
                  [t('source.databaseFrom'), source.database_from === 'loose' ? t('source.looseFile') : source.database_from],
                  [t('source.namesLanguage'), source.language],
                  [t('nav.leagues'), source.counts.leagues],
                  [t('nav.teams'), source.counts.teams],
                  [t('nav.players'), source.counts.players],
                ]}
              />
              {!!source.suspect_birthdates?.length && (
                <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t('source.suspectBirthdates', { dates: source.suspect_birthdates.join(', ') })}
                </p>
              )}
              {!!source.warnings?.length && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
                  {source.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
