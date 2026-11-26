import { Check, Circle, Loader2, Square } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/api/client'
import type { ExportJob, ExportStep } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n, type MessageKey } from '@/i18n'
import { clock } from '@/lib/clock'
import { useEta } from '@/lib/eta'
import { cn } from '@/lib/utils'

const STEP_LABELS: Record<ExportStep, MessageKey> = {
  prepare: 'export.stepPrepare',
  leagues: 'export.stepLeagues',
  teams: 'export.stepTeams',
  players: 'export.stepPlayers',
  stadiums: 'export.stepStadiums',
  nations: 'export.stepNations',
  adboards: 'export.stepAdboards',
  equipment: 'export.stepEquipment',
  write: 'export.stepWrite',
}
const ITEM_LABELS: Record<string, MessageKey> = {
  league: 'export.itemLeague',
  team: 'export.itemTeam',
  player: 'export.itemPlayer',
  stadium: 'export.itemStadium',
  nation: 'export.itemNation',
  adboard: 'export.itemAdboard',
  boot: 'export.itemBoot',
  glove: 'export.itemGlove',
  ball: 'export.itemBall',
  file: 'export.itemFile',
}
const WRITE_WEIGHT = 0.3 // share of the bar the zip takes (the items take the rest)
const fmtMb = (n: number) => (n / 2 ** 20).toFixed(0)

/** Step by step progress of an export (the Studios' build/import progress dialog): the item being read, items left,
 * time left of the items and of the zip, and the clock. "Parar" stops it and writes nothing. */
export function ExportProgressDialog({ job }: { job: ExportJob | null }) {
  const { t } = useI18n()
  const [asked, setAsked] = useState<string | null>(null) // the job the user asked to stop
  const open = job?.state === 'running'
  const steps = job?.steps ?? (Object.keys(STEP_LABELS) as ExportStep[])
  const current = job?.step ? steps.indexOf(job.step) : -1
  const writing = job?.step === 'write'
  const items = job?.total ? Math.min(1, job.done / job.total) : 0
  const bytes = writing && job?.bytes_total ? job.bytes_done / job.bytes_total : 0
  const overall = Math.round((writing ? 1 - WRITE_WEIGHT + WRITE_WEIGHT * bytes : (1 - WRITE_WEIGHT) * items) * 100)
  const elapsed = job?.elapsed ?? 0
  // time left of the step: each kind of item by its own pace (a stadium takes far longer than a player), the zip
  // by its bytes
  const stepKey = open && job?.step && job.step !== 'prepare' ? job.step : null
  const eta = useEta(
    stepKey,
    writing ? Math.round((job?.bytes_done ?? 0) / 2 ** 20) : (job?.step_done ?? 0),
    writing ? Math.round((job?.bytes_total ?? 0) / 2 ** 20) : (job?.step_total ?? 0),
    elapsed,
  )
  const left = job && !writing ? job.total - job.done : 0
  const stopping = open && (asked === job?.id || !!job?.stopping)

  const stop = () => {
    if (!job) return
    setAsked(job.id)
    api.cancelExport(job.id).catch((e: Error) => toast.error(e.message))
  }

  return (
    <Dialog open={open}>
      <DialogContent width="md" showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('export.progressTitle')}</DialogTitle>
          <DialogDescription>{t('export.progressDescription', { workers: job?.workers ?? 1 })}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${overall}%` }} />
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            <span>{overall}%</span>
            <span className="flex gap-3">
              {eta !== null && <span>{t('export.timeLeft', { time: clock(eta) })}</span>}
              <span>{t('export.elapsed', { time: clock(elapsed) })}</span>
            </span>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {steps.map((step, i) => {
            const state = i < current ? 'done' : i === current ? 'running' : 'pending'
            return (
              <li key={step} className={cn('flex items-center gap-2', state === 'pending' && 'text-muted-foreground')}>
                {state === 'done' ? (
                  <Check className="size-4 text-emerald-600" />
                ) : state === 'running' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Circle className="size-4" />
                )}
                <span className="flex-1">{t(STEP_LABELS[step])}</span>
                {state === 'running' && job!.step_total > 1 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {writing
                      ? t('export.bytes', { done: fmtMb(job!.bytes_done), total: fmtMb(job!.bytes_total) })
                      : t('export.count', { done: job!.step_done, total: job!.step_total })}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
          {job?.item && ITEM_LABELS[job.item.kind] && (
            <p className="truncate">{t(ITEM_LABELS[job.item.kind], { name: job.item.name || `#${job.item.id}` })}</p>
          )}
          {writing ? (
            <p className="tabular-nums">{t('export.filesCount', { done: job.step_done, total: job.step_total })}</p>
          ) : (
            !!job?.total && <p className="tabular-nums">{t('export.itemsLeft', { done: job.done, total: job.total, left })}</p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t pt-3">
          <p className="flex-1 text-xs text-muted-foreground">{stopping ? t('export.stopping') : t('export.stopHint')}</p>
          <Button variant="outline" size="sm" onClick={stop} disabled={stopping || !job}>
            {stopping ? <Loader2 className="animate-spin" /> : <Square />} {t('export.stop')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
