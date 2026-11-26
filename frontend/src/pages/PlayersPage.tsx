import { Link } from 'react-router-dom'
import { ScanFace } from 'lucide-react'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { RowSelect, SelectAllHead, useTreeOp } from '@/components/common/selectionTree'
import { Badge, OverallBadge } from '@/components/common/detail'
import { Flag, Photo } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'
import { usePageLabel } from '@/lib/back'

const FILTERS = ['q', 'position', 'team', 'face', 'in_basket'] as const

export function PlayersPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.players'))
  const list = useListState(FILTERS)
  const { data, isFetching, isLoading } = useList('players', list.request, api.players)
  const options = useOptions().data
  const op = useBasketOp()
  const tree = useTreeOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('players.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('players.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('players.search')} />
        <FilterSelect
          value={list.values.position}
          onChange={(v) => list.update({ position: v })}
          allLabel={t('filter.allPositions')}
          options={(options?.positions ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
        />
        <FilterSelect
          value={list.values.team}
          onChange={(v) => list.update({ team: v })}
          allLabel={t('filter.allTeams')}
          options={(options?.teams ?? []).map((tm) => ({ value: String(tm.id), label: tm.name }))}
        />
        <FilterSelect
          value={list.values.face}
          onChange={(v) => list.update({ face: v })}
          allLabel={t('filter.faceAny')}
          options={[
            { value: 'yes', label: t('filter.faceYes') },
            { value: 'no', label: t('filter.faceNo') },
          ]}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable loading={isLoading}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectAllHead rows={data?.items ?? []} total={data?.total ?? 0} fetchIds={() => api.listIds('/api/players', list.request).then((r) => r.ids)} onPick={(ids, on) => (on ? tree.setMany(ids.map((i) => `player:0:${i}`), 'all') : op.mutateAsync({ op: 'remove_players', args: { ids } }))} />
            </TableHead>
            <TableHead className="w-12" />
            <SortHead field="name" label={t('col.name')} state={sortState} />
            <SortHead field="team" label={t('col.team')} state={sortState} className="text-right" />
            <SortHead field="overall" label={t('col.overall')} state={sortState} className="text-center" />
            <SortHead field="position_code" label={t('col.position')} state={sortState} className="text-center" />
            <SortHead field="birthdate" label={t('col.birthdate')} state={sortState} className="text-center" />
            <SortHead field="id" label={t('col.id')} state={sortState} className="text-center" />
            <SortHead field="nationality" label={t('col.nationality')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <RowSelect row={p} onRemove={() => op.mutateAsync({ op: 'remove_players', args: { ids: [p.id] } })} />
              </TableCell>
              <TableCell>
                <Photo id={p.id} size={64} available={p.has_photo} className="size-9 rounded" />
              </TableCell>
              <TableCell data-grow>
                <div className="flex items-center gap-2">
                  <Link to={`/players/${p.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  {p.has_face && (
                    <span title={t('players.hasFace')}>
                      <ScanFace className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">{p.team ?? '—'}</TableCell>
              <TableCell className="text-center">
                <OverallBadge value={p.overall} />
              </TableCell>
              <TableCell className="text-center">{p.position ?? '—'}</TableCell>
              <TableCell className="text-center tabular-nums">{p.birthdate_suspect ? <Badge tone="warn">?</Badge> : (p.birthdate ?? '—')}</TableCell>
              <TableCell className="text-center text-muted-foreground tabular-nums">{p.id}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <Flag id={p.nationality_id} className="h-3.5 w-5" />
                  {p.nationality ?? '—'}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                {t('list.empty')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </ScrollTable>
      {data && <Pager page={data.page} pages={data.pages} total={data.total} size={data.size} onPage={(page, size) => list.update({ page, ...(size ? { size } : {}) }, false)} />}
    </div>
  )
}
