import { useQuery } from '@tanstack/react-query'
import { Building2, Check, ChevronDown, ChevronRight, Folder, Loader2, Minus, RectangleHorizontal } from 'lucide-react'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/api/client'
import type { BasketNode, TreeNode, TreeState } from '@/api/types'
import { Badge, BasketButton } from '@/components/common/detail'
import { Crest, EquipmentImage, Flag, LeagueImage, Photo } from '@/components/common/pictures'
import { translate, useI18n, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useBasketOp, useToken } from '@/state/queries'

// ---------------------------------------------------------------- the adjust dialog (one for the whole app)
let adjustKey: string | null = null
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
/** Opens the "Adjust" dialog on one item of the selection tree. */
export function openAdjust(key: string | null) {
  adjustKey = key
  listeners.forEach((l) => l())
}

function useTree(key: string | null, inside = false) {
  const token = useToken()
  return useQuery({ queryKey: ['tree', token, key, inside], queryFn: () => api.tree(key!, inside), enabled: !!token && !!key })
}

/** A click in the tree: mode all = the item and everything inside; none = nothing of it; only = it alone. */
export function useTreeOp() {
  const op = useBasketOp()
  return {
    pending: op.isPending,
    set: (key: string, mode: 'all' | 'none' | 'only') => op.mutateAsync({ op: 'tree', args: { key, mode } }),
    setMany: (keys: string[], mode: 'all' | 'none' | 'only') => op.mutateAsync({ op: 'tree_many', args: { keys, mode } }),
  }
}

/** The notice after an item came in with everything inside: what came, and the "Adjust" button. */
async function noticeAdded(key: string) {
  const { node } = await api.tree(key, true)
  const inside = node.inside ?? { leagues: 0, teams: 0, players: 0 }
  const what = (
    [
      ['leagues', 'tree.nLeagues'],
      ['teams', 'tree.nTeams'],
      ['players', 'tree.nPlayers'],
    ] as const
  )
    .filter(([k]) => inside[k] > 0)
    .map(([k, msg]) => translate(msg, { count: inside[k] }))
  const name = nodeName(node, translate)
  toast.success(what.length ? translate('tree.addedWith', { name, what: what.join(', ') }) : translate('tree.added', { name }), {
    action: { label: translate('tree.adjust'), onClick: () => openAdjust(key) },
  })
}

// ---------------------------------------------------------------- pieces
type T = (key: MessageKey, vars?: Record<string, string | number>) => string

/** The text of a tree row. */
function nodeName(n: TreeNode, t: T): string {
  const named = (label: MessageKey, name: string | null, code?: number | null) => `${t(label)}: ${name ?? (code ? `#${code}` : '—')}`
  switch (n.kind) {
    case 'stadium':
      return named('tree.stadium', n.name)
    case 'ball':
      return named('tree.ball', n.name, n.code)
    case 'boot':
      return named('tree.boot', n.name, n.code)
    case 'glove':
      return named('tree.glove', n.name, n.code)
    case 'adboards':
    case 'leagueboards':
      return t('tree.adboards')
    case 'group':
      return t(`tree.group.${n.id}` as MessageKey)
    case 'gear':
      return n.name ?? `#${n.code}`
    default:
      return n.name ?? `#${n.id}`
  }
}

const GEAR_LIST: Record<string, string> = { boot: 'boots', glove: 'gloves', ball: 'balls' }

function NodePicture({ n }: { n: TreeNode }) {
  const box = 'size-6 shrink-0 object-contain'
  const id = typeof n.id === 'number' ? n.id : 0
  if (n.kind === 'nation') return <Flag id={id} size={32} className="h-4 w-6 shrink-0" />
  if (n.kind === 'league') return <LeagueImage id={id} size={32} className={box} />
  if (n.kind === 'team') return <Crest id={id} size={32} className={box} />
  if (n.kind === 'player') return <Photo id={id} size={32} className={cn(box, 'rounded-full')} />
  if (n.code && (GEAR_LIST[n.kind] || n.kind === 'gear')) {
    const list = n.kind === 'gear' ? String(n.key.split(':')[1]) : GEAR_LIST[n.kind]
    return <EquipmentImage kind={list} code={n.code} size={64} className={box} />
  }
  const Icon = n.kind === 'stadium' || n.kind === 'onestadium' ? Building2 : n.kind.includes('boards') || n.kind === 'adboard' ? RectangleHorizontal : Folder
  return <Icon className="size-4 shrink-0 text-muted-foreground" />
}

/** The kind badge in front of each tree row: its label and color (same color for the same kind of thing). */
const KIND_BADGE: Record<string, [MessageKey, string]> = {
  nation: ['tree.kind.nation', 'bg-sky-500/15 text-sky-700 dark:text-sky-300'],
  league: ['tree.kind.league', 'bg-violet-500/15 text-violet-700 dark:text-violet-300'],
  team: ['tree.kind.team', 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'],
  player: ['tree.kind.player', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
  stadium: ['tree.kind.stadium', 'bg-orange-500/15 text-orange-700 dark:text-orange-300'],
  ball: ['tree.kind.ball', 'bg-rose-500/15 text-rose-700 dark:text-rose-300'],
  adboards: ['tree.kind.adboards', 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'],
  boot: ['tree.kind.boot', 'bg-lime-500/15 text-lime-700 dark:text-lime-300'],
  glove: ['tree.kind.glove', 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300'],
  group: ['tree.kind.group', 'bg-muted text-muted-foreground'],
}
const BADGE_OF: Record<string, string> = { onestadium: 'stadium', leagueboards: 'adboards', adboard: 'adboards' }

function KindBadge({ n }: { n: TreeNode }) {
  const { t } = useI18n()
  const kind = n.kind === 'gear' ? { boots: 'boot', gloves: 'glove', balls: 'ball' }[String(n.key.split(':')[1])] ?? 'group' : (BADGE_OF[n.kind] ?? n.kind)
  const [label, color] = KIND_BADGE[kind] ?? KIND_BADGE.group
  return <span className={cn('inline-flex w-16 shrink-0 justify-center rounded px-1.5 py-0.5 text-[11px] font-medium', color)}>{t(label)}</span>
}

/** The tree's checkbox: ✓ it and everything inside, – some of it, • it alone. */
export function TreeBox({ state, onClick, disabled, label }: { state: TreeState; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'full' ? true : state === 'none' ? false : 'mixed'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>svg]:size-3.5',
        state === 'full' && 'border-primary bg-primary text-primary-foreground dark:bg-primary',
        (state === 'part' || state === 'only') && 'border-primary bg-primary/15 text-primary',
      )}
    >
      {state === 'full' && <Check />}
      {state === 'part' && <Minus />}
      {state === 'only' && <span className="size-1.5 rounded-full bg-current" />}
    </button>
  )
}

/** The legend of the three marks. */
export function TreeLegend() {
  const { t } = useI18n()
  const item = (state: TreeState, text: string) => (
    <span className="flex items-center gap-1.5">
      <span className="pointer-events-none">
        <TreeBox state={state} onClick={() => {}} label={text} />
      </span>
      {text}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {item('full', t('tree.legendFull'))}
      {item('part', t('tree.legendPart'))}
      {item('only', t('tree.legendOnly'))}
    </div>
  )
}

// ---------------------------------------------------------------- the tree
function TreeRow({ node, depth, defaultOpen = false }: { node: TreeNode; depth: number; defaultOpen?: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(defaultOpen)
  const op = useTreeOp()
  const hasInside = !!node.count
  const canAlone = hasInside && node.kind !== 'group' && node.kind !== 'root'
  const toggle = () => void op.set(node.key, node.state === 'full' ? 'none' : 'all').catch(() => {})
  return (
    <>
      <div className="flex min-h-9 items-center gap-2 border-b py-1 pr-3 hover:bg-muted/50" style={{ paddingLeft: 8 + depth * 22 }}>
        {hasInside ? (
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label={open ? t('tree.close') : t('tree.open')}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <TreeBox state={node.state} onClick={toggle} disabled={op.pending} label={node.state === 'full' ? t('basket.remove') : t('basket.add')} />
        <KindBadge n={node} />
        <NodePicture n={node} />
        <button type="button" className="min-w-0 truncate text-left text-sm" onClick={() => hasInside && setOpen(!open)}>
          {nodeName(node, t)}
        </button>
        {node.detail && <span className="truncate text-xs text-muted-foreground">{node.detail}</span>}
        {node.shared > 0 && node.state !== 'full' && <Badge tone="warn">{t('tree.shared', { count: node.shared })}</Badge>}
        <span className="ml-auto" />
        {node.state === 'only' && <Badge>{t('tree.alone')}</Badge>}
        {node.count && (
          <span className="text-xs text-muted-foreground tabular-nums" title={t('tree.insideHint')}>
            {t('tree.inside', { on: node.count.on, total: node.count.total })}
          </span>
        )}
        {canAlone && (
          <button
            type="button"
            className="shrink-0 text-xs text-primary hover:underline disabled:opacity-50"
            disabled={op.pending}
            onClick={() => void op.set(node.key, node.state === 'only' ? 'all' : 'only').catch(() => {})}
          >
            {node.state === 'only' ? t('tree.everything') : t('tree.onlyIt')}
          </button>
        )}
      </div>
      {open && hasInside && <TreeChildren parent={node.key} depth={depth + 1} />}
    </>
  )
}

function TreeChildren({ parent, depth }: { parent: string; depth: number }) {
  const { t } = useI18n()
  const { data, isLoading } = useTree(parent)
  if (isLoading)
    return (
      <div className="flex items-center gap-2 border-b py-2 text-xs text-muted-foreground" style={{ paddingLeft: 8 + depth * 22 }}>
        <Loader2 className="size-3.5 animate-spin" /> {t('tree.loading')}
      </div>
    )
  return (
    <>
      {data?.children.map((c) => (
        <TreeRow key={c.key} node={c} depth={depth} />
      ))}
    </>
  )
}

/** The whole basket as a tree (the export screen). */
export function BasketTree({ empty }: { empty: ReactNode }) {
  const { data, isLoading } = useTree('root')
  if (isLoading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  if (!data?.children.length) return <>{empty}</>
  return (
    <div className="overflow-hidden rounded-md border">
      {data.children.map((c) => (
        <TreeRow key={c.key} node={c} depth={0} />
      ))}
    </div>
  )
}

/** The "Adjust" dialog: the tree of one item, as big as the screen. Mounted once, in the shell. */
export function AdjustDialog() {
  const { t } = useI18n()
  const key = useSyncExternalStore(subscribe, () => adjustKey)
  const { data } = useTree(key)
  return (
    <Dialog open={!!key} onOpenChange={(open) => !open && openAdjust(null)}>
      {/* the click on the notice's "Adjust" (and the focus it gives back as it goes) must not close it */}
      <DialogContent
        width="full"
        className="flex flex-col"
        onInteractOutside={(e) => {
          if (e.type === 'dismissableLayer.focusOutside' || (e.target as Element | null)?.closest?.('[data-sonner-toaster]')) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('tree.adjustTitle', { name: data ? nodeName(data.node, t) : '' })}</DialogTitle>
          <DialogDescription>{t('tree.adjustHint')}</DialogDescription>
        </DialogHeader>
        <TreeLegend />
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">{data && <TreeRow key={data.node.key} node={data.node} depth={0} defaultOpen />}</div>
      </DialogContent>
    </Dialog>
  )
}

/** A part of a team or league (its stadium, ball, board files) going in the package or not: the same node as in
 * the tree. Nothing when the item has no such part (`state` null). */
export function PartToggle({ nodeKey, state, label, hint }: { nodeKey: string; state: TreeState | null; label: string; hint?: string }) {
  const op = useTreeOp()
  if (state === null) return null
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <span className="pt-0.5">
        <TreeBox state={state} disabled={op.pending} label={label} onClick={() => void op.set(nodeKey, state === 'full' ? 'none' : 'all').catch(() => {})} />
      </span>
      <span>
        <span className="whitespace-nowrap font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------- in the lists
/** The checkbox of a list row: a click takes the item with everything inside (and shows what came, with "Adjust");
 * `onRemove` replaces the plain removal (a player leaves every team of the basket). */
export function RowSelect({ row, onRemove }: { row: BasketNode; onRemove?: () => Promise<unknown> }) {
  const { t } = useI18n()
  const op = useTreeOp()
  const inside = row.basket_state !== 'none'
  const click = async () => {
    try {
      if (row.basket_state === 'full') await (onRemove ? onRemove() : op.set(row.basket_key, 'none'))
      else {
        await op.set(row.basket_key, 'all')
        if (row.basket_count) await noticeAdded(row.basket_key)
      }
    } catch {
      /* the mutation shows the error */
    }
  }
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <TreeBox state={row.basket_state} onClick={() => void click()} disabled={op.pending} label={row.basket_state === 'full' ? t('basket.remove') : t('basket.add')} />
      {inside && row.basket_count && (
        <>
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.basket_state === 'only' ? t('tree.alone') : t('tree.inside', { on: row.basket_count.on, total: row.basket_count.total })}
          </span>
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => openAdjust(row.basket_key)}>
            {t('tree.adjust')}
          </button>
        </>
      )}
    </div>
  )
}

/** The "Add to basket" button of an item's screen: the same click as the list's checkbox, plus "Adjust". */
export function DetailSelect({ row, onRemove }: { row: BasketNode; onRemove?: () => Promise<unknown> }) {
  const { t } = useI18n()
  const op = useTreeOp()
  const inside = row.basket_state !== 'none'
  const click = async () => {
    try {
      if (inside) await (onRemove ? onRemove() : op.set(row.basket_key, 'none'))
      else {
        await op.set(row.basket_key, 'all')
        if (row.basket_count) await noticeAdded(row.basket_key)
      }
    } catch {
      /* the mutation shows the error */
    }
  }
  return (
    <div className="flex items-center gap-2">
      {inside && row.basket_count && (
        <Button variant="outline" size="sm" onClick={() => openAdjust(row.basket_key)}>
          {t('tree.adjust')}
        </Button>
      )}
      <BasketButton inside={inside} busy={op.pending} onToggle={() => void click()} />
    </div>
  )
}

/** The header checkbox of a list: asks "this page or every page" (as the FIFA 14 Studio) and puts them in the basket
 * (or takes them out, when the whole page is in). `onPick(ids, on)` does it; `fetchIds` gives the ids of every page.
 * Without `fetchIds` (a table with no pages) it does it at once, without asking. */
export function SelectAllHead({ rows, total, fetchIds, onPick }: { rows: (BasketNode & { id: number | string })[]; total: number; fetchIds?: () => Promise<(number | string)[]>; onPick: (ids: (number | string)[], on: boolean) => Promise<unknown> }) {
  const { t } = useI18n()
  const [asking, setAsking] = useState<null | 'add' | 'remove'>(null)
  const [busy, setBusy] = useState(false)
  const allIn = rows.length > 0 && rows.every((r) => r.basket_state === 'full')
  const someIn = rows.some((r) => r.basket_state !== 'none')
  const run = async (every: boolean, on = asking === 'add') => {
    setBusy(true)
    try {
      const ids = every && fetchIds ? await fetchIds() : rows.map((r) => r.id)
      await onPick(ids, on)
      toast.success(t(on ? 'selectAll.added' : 'selectAll.removed', { count: ids.length }))
      setAsking(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <TreeBox
        state={allIn ? 'full' : someIn ? 'part' : 'none'}
        disabled={!rows.length}
        label={t('selectAll.label')}
        onClick={() => (fetchIds ? setAsking(allIn ? 'remove' : 'add') : void run(false, !allIn))}
      />
      <AlertDialog open={!!asking} onOpenChange={(open) => !open && !busy && setAsking(null)}>
        {/* three buttons with counts: the medium width (ui/dialog-width.ts) */}
        <AlertDialogContent width="md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t(asking === 'remove' ? 'selectAll.removeTitle' : 'selectAll.addTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(asking === 'remove' ? 'selectAll.removeDescription' : 'selectAll.addDescription', { page: rows.length, all: total })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <Button variant="outline" disabled={busy} onClick={() => void run(false)}>
              {t('selectAll.page', { count: rows.length })}
            </Button>
            <Button disabled={busy} onClick={() => void run(true)}>
              {busy && <Loader2 className="animate-spin" />}
              {t('selectAll.every', { count: total })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
