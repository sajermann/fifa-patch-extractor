import { Landmark } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { SelectAllHead, useTreeOp } from '@/components/common/selectionTree'
import { Badge, BasketCheck } from '@/components/common/detail'
import { StadiumImage } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'
import { usePageLabel } from '@/lib/back'

const FILTERS = ['q', 'country', 'home', 'in_basket'] as const

export function StadiumsPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.stadiums'))
  const navigate = useNavigate()
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('stadiums', list.request, api.stadiums)
  const options = useOptions().data
  const op = useBasketOp()
  const tree = useTreeOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('stadiums.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('stadiums.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('stadiums.search')} />
        <FilterSelect
          value={list.values.country}
          onChange={(v) => list.update({ country: v })}
          allLabel={t('filter.allCountries')}
          options={(options?.nations ?? []).map((n) => ({ value: String(n.id), label: n.name ?? `#${n.id}` }))}
        />
        <FilterSelect
          value={list.values.home}
          onChange={(v) => list.update({ home: v })}
          allLabel={t('filter.homeAny')}
          options={[
            { value: 'yes', label: t('filter.homeYes') },
            { value: 'no', label: t('filter.homeNo') },
          ]}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectAllHead rows={data?.items ?? []} total={data?.total ?? 0} fetchIds={() => api.listIds('/api/stadiums', list.request).then((r) => r.ids)} onPick={(ids, on) => tree.setMany(ids.map((i) => `onestadium:${i}`), on ? 'all' : 'none')} />
            </TableHead>
            <TableHead className="w-28" />
            <SortHead field="name" label={t('col.name')} state={sortState} />
            <SortHead field="country" label={t('col.country')} state={sortState} />
            <TableHead>{t('col.homeTeam')}</TableHead>
            <SortHead field="capacity" label={t('col.capacity')} state={sortState} />
            <SortHead field="team_count" label={t('col.teams')} state={sortState} />
            <SortHead field="id" label={t('col.id')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((s) => (
            <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/stadiums/${s.id}`)}>
              <TableCell>
                <BasketCheck
                  checked={s.in_basket}
                  label={s.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_stadium' : 'remove_stadium', args: { id: s.id } })}
                />
              </TableCell>
              <TableCell>
                {s.picture !== null ? (
                  <StadiumImage id={s.id} variant={s.picture} size={128} className="h-7 w-24 rounded object-cover" />
                ) : (
                  <span className="inline-flex h-7 w-24 items-center justify-center rounded bg-muted text-muted-foreground/50">
                    <Landmark className="size-4" />
                  </span>
                )}
              </TableCell>
              <TableCell data-grow>
                <div className="flex items-center gap-2 font-medium">
                  {s.name}
                  {!s.has_3d && <Badge>{t('stadiums.no3d')}</Badge>}
                </div>
                {s.language_name && s.language_name !== s.name && <div className="text-xs text-muted-foreground">{s.language_name}</div>}
              </TableCell>
              <TableCell>{s.country ?? '—'}</TableCell>
              <TableCell>{s.home_team ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{s.capacity?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{s.team_count}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{s.id}</TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
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
