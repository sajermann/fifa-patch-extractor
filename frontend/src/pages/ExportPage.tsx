import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FolderOpen, Loader2, Package, Save, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, exportUrl } from '@/api/client'
import type { BasketForm, ExportJob } from '@/api/types'
import { Badge, Section } from '@/components/common/detail'
import { ExportProgressDialog } from '@/components/common/ExportProgress'
import { BasketTree, TreeLegend } from '@/components/common/selectionTree'
import { useI18n } from '@/i18n'
import { useBasketOp, useBasketView, useStatus } from '@/state/queries'
import { usePageLabel } from '@/lib/back'
import { clock } from '@/lib/clock'

const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export function ExportPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.export'))
  const basket = useBasketView().data
  const op = useBasketOp()
  const ready = useStatus().data?.source.state === 'ready'
  const empty = !basket || basket.counts.nations + basket.counts.leagues + basket.counts.teams + basket.counts.players + basket.counts.stadiums + basket.counts.adboards + (basket.counts.boots ?? 0) + (basket.counts.gloves ?? 0) + (basket.counts.balls ?? 0) === 0
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('export.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('export.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <SavedSelections />
          <Button variant="outline" disabled={empty || op.isPending} onClick={() => op.mutate({ op: 'clear' })}>
            <Trash2 /> {t('export.clear')}
          </Button>
        </div>
      </div>
      {basket && (
        <Section title={t('export.contents')} description={t('export.contentsHint')} action={<TreeLegend />}>
          <BasketTree empty={<p className="text-sm text-muted-foreground">{t('export.none')}</p>} />
        </Section>
      )}
      {basket && <ExportForm form={basket.form} disabled={empty || !ready} />}
      <ExportsList />
    </div>
  )
}

function ExportForm({ form, disabled }: { form: BasketForm; disabled: boolean }) {
  const { t } = useI18n()
  const op = useBasketOp()
  const qc = useQueryClient()
  const [draft, setDraft] = useState(form)
  const [job, setJob] = useState<ExportJob | null>(null)
  useEffect(() => setDraft(form), [form])
  const save = (fields: Partial<BasketForm>) => op.mutate({ op: 'set_form', args: fields })
  const start = useMutation({
    mutationFn: async () => {
      await api.basketOp('set_form', { ...draft })
      return api.startExport()
    },
    onSuccess: setJob,
    onError: (e: Error) => toast.error(e.message),
  })
  useEffect(() => {
    if (!job || job.state !== 'running') return
    const id = setInterval(async () => {
      try {
        const next = await api.exportJob(job.id)
        setJob(next)
        if (next.state === 'done') {
          toast.success(t('export.done', { name: next.result?.name ?? '' }), { description: t('export.doneIn', { time: clock(next.elapsed) }) })
          void qc.invalidateQueries({ queryKey: ['exports'] })
        } else if (next.state === 'cancelled') toast.info(t('export.stopped'))
        else if (next.state === 'error') toast.error(t('export.failed', { error: next.error ?? '' }))
      } catch (e) {
        toast.error((e as Error).message)
      }
    }, 400)
    return () => clearInterval(id)
  }, [job, qc, t])
  const running = job?.state === 'running' || start.isPending
  return (
    <Section title={t('export.package')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="patch_name">{t('export.patchName')}</Label>
          <Input id="patch_name" value={draft.patch_name} onChange={(e) => setDraft({ ...draft, patch_name: e.target.value })} onBlur={() => save({ patch_name: draft.patch_name })} />
          <p className="text-xs text-muted-foreground">{t('export.patchNameHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="credits">{t('export.credits')}</Label>
          <Input id="credits" value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: e.target.value })} onBlur={() => save({ credits: draft.credits })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="credits_url">{t('export.creditsUrl')}</Label>
          <Input id="credits_url" value={draft.credits_url} placeholder="https://" onChange={(e) => setDraft({ ...draft, credits_url: e.target.value })} onBlur={() => save({ credits_url: draft.credits_url })} />
          <p className="text-xs text-muted-foreground">{t('export.creditsHint')}</p>
        </div>
        <div className="flex items-start gap-3 pt-6">
          <Checkbox
            id="originals"
            checked={draft.include_originals}
            onCheckedChange={(v) => {
              setDraft({ ...draft, include_originals: v === true })
              save({ include_originals: v === true })
            }}
          />
          <div>
            <Label htmlFor="originals">{t('export.includeOriginals')}</Label>
            <p className="text-xs text-muted-foreground">{t('export.includeOriginalsHint')}</p>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button disabled={disabled || running} onClick={() => start.mutate()}>
          {running ? <Loader2 className="animate-spin" /> : <Package />} {t('export.start')}
        </Button>
        {job?.state === 'done' && job.result && (
          <span className="flex items-center gap-2 text-sm">
            <Badge tone="ok">{t('export.ready')}</Badge>
            {job.result.name} · {fmtSize(job.result.size)} · {t('export.doneIn', { time: clock(job.elapsed) })}
            <Button size="sm" variant="outline" asChild>
              <a href={exportUrl(job.result.name)} download>
                <Download /> {t('export.download')}
              </a>
            </Button>
          </span>
        )}
      </div>
      {job?.state === 'done' && !!job.result?.warnings.length && (
        <div className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">{t('export.skipped', { count: job.result.warnings.length })}</p>
          <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 font-mono text-xs">
            {job.result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <ExportProgressDialog job={job} />
    </Section>
  )
}

function ExportsList() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const status = useStatus().data
  const { data } = useQuery({ queryKey: ['exports'], queryFn: api.exports })
  const remove = useMutation({ mutationFn: api.deleteExport, onSuccess: () => qc.invalidateQueries({ queryKey: ['exports'] }) })
  return (
    <Section
      title={t('export.files')}
      action={
        <Button size="sm" variant="outline" onClick={() => api.openExportsFolder().catch((e: Error) => toast.error(e.message))}>
          <FolderOpen /> {t('export.openFolder')}
        </Button>
      }
    >
      <p className="mb-3 font-mono text-xs text-muted-foreground">{status?.exports_dir}</p>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">{t('export.noFiles')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.map((f) => (
            <li key={f.name} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
              <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span>
              <span className="text-xs text-muted-foreground">{fmtDate(f.modified)}</span>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={exportUrl(f.name)} download aria-label={t('export.download')} title={t('export.download')}>
                  <Download />
                </a>
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => remove.mutate(f.name)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SavedSelections() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const { data } = useQuery({ queryKey: ['selections'], queryFn: api.selections, enabled: open })
  const refresh = () => {
    // same keys as useBasketOp, so the "What goes in the package" tree and every list follow the loaded basket
    for (const k of ['selections', 'status', 'boots', 'gloves', 'balls', 'adboards', 'stadiums', 'nations', 'leagues', 'teams', 'players', 'stadium', 'nation', 'league', 'team', 'player', 'basket', 'tree']) void qc.invalidateQueries({ queryKey: [k] })
  }
  const save = useMutation({ mutationFn: () => api.saveSelection(name), onSuccess: () => { toast.success(t('selections.saved')); setName(''); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const load = useMutation({ mutationFn: api.loadSelection, onSuccess: () => { toast.success(t('selections.loaded')); setOpen(false); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const remove = useMutation({ mutationFn: api.deleteSelection, onSuccess: refresh })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Save /> {t('selections.title')}
        </Button>
      </DialogTrigger>
      <DialogContent width="md">
        <DialogHeader>
          <DialogTitle>{t('selections.title')}</DialogTitle>
          <DialogDescription>{t('selections.hint')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('selections.namePlaceholder')} />
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            <Save /> {t('selections.save')}
          </Button>
        </div>
        <ul className="max-h-80 space-y-2 overflow-auto">
          {data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('selections.counts', { boots: s.boots ?? 0, gloves: s.gloves ?? 0, balls: s.balls ?? 0, adboards: s.adboards ?? 0, stadiums: s.stadiums ?? 0, nations: s.nations ?? 0, leagues: s.leagues, teams: s.teams, players: s.players })} · {fmtDate(s.updated_at)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => load.mutate(s.id)}>
                <Upload /> {t('selections.load')}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => remove.mutate(s.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {data && !data.length && <p className="text-sm text-muted-foreground">{t('selections.empty')}</p>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
