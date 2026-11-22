import { Flag as FlagIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { BasketCheck } from '@/components/common/detail'
import { Flag } from '@/components/common/pictures'
import { hasMessage, useI18n, type MessageKey } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'
import { usePageLabel } from '@/lib/back'

const FILTERS = ['q', 'confederation', 'leagues', 'in_basket'] as const

/** Name of a confederation code of the database. */
export function useConfederationName() {
  const { t } = useI18n()
  return (code: number | null) => {
    if (code === null) return '—'
    const key = `confederation.${code}`
    return hasMessage(key) ? t(key as MessageKey) : String(code)
  }
}

export function NationsPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.nations'))
  const navigate = useNavigate()
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('nations', list.request, api.nations)
  const options = useOptions().data
  const op = useBasketOp()
  const confederation = useConfederationName()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('nations.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('nations.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('nations.search')} />
        <FilterSelect
          value={list.values.confederation}
          onChange={(v) => list.update({ confederation: v })}
          allLabel={t('filter.allConfederations')}
          options={(options?.confederations ?? []).map((c) => ({ value: String(c), label: confederation(c) }))}
        />
        <FilterSelect
          value={list.values.leagues}
          onChange={(v) => list.update({ leagues: v })}
          allLabel={t('filter.leaguesAny')}
          className="w-44"
          options={[
            { value: 'yes', label: t('filter.leaguesYes') },
            { value: 'no', label: t('filter.leaguesNo') },
          ]}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-12" />
            <SortHead field="name" label={t('col.name')} state={sortState} />
            <SortHead field="confederation" label={t('col.confederation')} state={sortState} />
            <SortHead field="league_count" label={t('col.leagues')} state={sortState} />
            <SortHead field="player_count" label={t('col.players')} state={sortState} />
            <SortHead field="id" label={t('col.id')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((n) => (
            <TableRow key={n.id} className="cursor-pointer" onClick={() => navigate(`/nations/${n.id}`)}>
              <TableCell>
                <BasketCheck
                  checked={n.in_basket}
                  label={n.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_nation' : 'remove_nation', args: { id: n.id } })}
                />
              </TableCell>
              <TableCell>
                <Flag id={n.id} size={64} available={n.has_flag} className="h-5 w-8" fallback={<FlagIcon className="size-4" />} />
              </TableCell>
              <TableCell data-grow>
                <div className="font-medium">{n.name}</div>
                {n.database_name && n.database_name !== n.name && <div className="text-xs text-muted-foreground">{n.database_name}</div>}
              </TableCell>
              <TableCell>{confederation(n.confederation)}</TableCell>
              <TableCell className="tabular-nums">{n.league_count}</TableCell>
              <TableCell className="tabular-nums">{n.player_count}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{n.id}</TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
