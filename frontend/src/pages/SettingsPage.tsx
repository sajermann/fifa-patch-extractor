import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/api/client'
import type { Config, Status } from '@/api/types'
import { Facts, Section } from '@/components/common/detail'
import { LANGS, useI18n, type Lang } from '@/i18n'
import { APP_NAME, APP_VERSION, AUTHOR_GITHUB, AUTHOR_NAME, REPO_URL } from '@/lib/about'
import { useTheme } from '@/lib/theme'
import { exportResourcesErrors, plannedThreads, useMachine, type ExportResourcesValue } from '@/lib/exportResources'
import { useStatus } from '@/state/queries'

export function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const status = useStatus().data
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (fields: Partial<Config>) => api.saveSettings(fields),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  })
  const pickOutput = async () => {
    try {
      const r = await api.pickFolder(status?.exports_dir, t('settings.outputTitle'))
      if (r.path) save.mutate({ output_dir: r.path })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const languages = status?.source.languages ?? []
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      <Section title={t('settings.interface')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('settings.language')}</p>
            <Select
              value={lang}
              onValueChange={(v) => {
                setLang(v as Lang)
                save.mutate({ language: v as Lang })
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('settings.theme')}</p>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('theme.system')}</SelectItem>
                <SelectItem value="light">{t('theme.light')}</SelectItem>
                <SelectItem value="dark">{t('theme.dark')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>
      <Section title={t('settings.gameNames')}>
        <p className="mb-3 text-sm text-muted-foreground">{t('settings.gameNamesHint')}</p>
        <Select value={status?.config.game_language ?? 'eng_us'} onValueChange={(v) => save.mutate({ game_language: v })} disabled={!languages.length}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(languages.length ? languages : [status?.config.game_language ?? 'eng_us']).map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section title={t('settings.output')}>
        <p className="mb-3 font-mono text-xs">{status?.exports_dir}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pickOutput}>
            <FolderOpen /> {t('settings.chooseOutput')}
          </Button>
          {status?.config.output_dir && (
            <Button variant="ghost" onClick={() => save.mutate({ output_dir: null })}>
              <RotateCcw /> {t('settings.defaultOutput')}
            </Button>
          )}
        </div>
      </Section>
      {status && <ResourcesSection status={status} />}
      <Section title={t('settings.about')}>
        <Facts
          items={[
            [t('settings.app'), `${APP_NAME} ${APP_VERSION}`],
            [t('settings.author'), <a key="a" href={AUTHOR_GITHUB} target="_blank" rel="noreferrer" className="hover:underline">{AUTHOR_NAME}</a>],
            [t('settings.code'), <a key="c" href={REPO_URL} target="_blank" rel="noreferrer" className="hover:underline">{REPO_URL}</a>],
            [t('settings.license'), 'GPL-3.0'],
          ]}
        />
        <p className="mt-4 text-xs text-muted-foreground">{t('settings.disclaimer')}</p>
      </Section>
    </div>
  )
}

/** How much of the machine an export may use: cores and percent of the memory (empty = the defaults). The Studios'
 * "build performance" card (BuildResourcesFields), with the extractor's Section and the export's threads. */
function ResourcesSection({ status }: { status: Status }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const machine = useMachine()
  const [value, setValue] = useState<ExportResourcesValue>({
    export_cores: status.config.export_cores ?? null,
    export_memory_percent: status.config.export_memory_percent ?? null,
  })
  const [saving, setSaving] = useState(false)
  const errors = exportResourcesErrors(machine, value)
  const cores = machine?.cores
  const [low, high] = machine?.memory_percent_range ?? [10, 90]
  const memoryGb = machine?.memory_mb ? (machine.memory_mb / 1024).toFixed(1) : null
  const number = (text: string) => (text.trim() === '' ? null : Number(text))
  const save = async () => {
    setSaving(true)
    try {
      await api.saveSettings({ export_cores: value.export_cores ?? null, export_memory_percent: value.export_memory_percent ?? null })
      await qc.invalidateQueries({ queryKey: ['status'] })
      await qc.invalidateQueries({ queryKey: ['machine'] })
      toast.success(t('settings.saved'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Section title={t('exportResources.title')}>
      <p className="mb-4 text-sm text-muted-foreground">{t('exportResources.description')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('exportResources.cores')}</p>
          <Input
            type="number"
            min={1}
            max={cores ?? undefined}
            value={value.export_cores ?? ''}
            placeholder={t('exportResources.automatic', { value: machine?.default_cores ?? 1 })}
            onChange={(e) => setValue({ ...value, export_cores: number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            {cores ? t('exportResources.coresHint', { cores, default: machine.default_cores }) : t('exportResources.coresUnknown')}
          </p>
          {errors.cores && <p className="text-xs text-destructive">{t(errors.cores, { max: cores ?? 1 })}</p>}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('exportResources.memory')}</p>
          <Input
            type="number"
            min={low}
            max={high}
            value={value.export_memory_percent ?? ''}
            placeholder={t('exportResources.automatic', { value: `${machine?.default_memory_percent ?? 50}%` })}
            onChange={(e) => setValue({ ...value, export_memory_percent: number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            {memoryGb ? t('exportResources.memoryHint', { memory: memoryGb, low, high }) : t('exportResources.memoryUnknown')}
          </p>
          {errors.memory && <p className="text-xs text-destructive">{t(errors.memory, { low, high })}</p>}
        </div>
      </div>
      {machine && !errors.cores && !errors.memory && (
        <p className="mt-4 text-sm text-muted-foreground">{t('exportResources.summary', { workers: plannedThreads(machine, value) })}</p>
      )}
      <Button className="mt-4" onClick={() => void save()} disabled={saving || !!errors.cores || !!errors.memory}>
        {saving && <Loader2 className="animate-spin" />} {t('settings.save')}
      </Button>
    </Section>
  )
}
