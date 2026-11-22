import { useNavigate } from 'react-router-dom'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { BasketCheck } from '@/components/common/detail'
import { LeagueImage } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions } from '@/state/queries'
import { usePageLabel } from '@/lib/back'

const FILTERS = ['q', 'country', 'level', 'in_basket'] as const

export function LeaguesPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.leagues'))
  const navigate = useNavigate()
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('leagues', list.request, api.leagues)
  const options = useOptions().data
  const op = useBasketOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('leagues.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('leagues.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('leagues.search')} />
        <FilterSelect
          value={list.values.country}
          onChange={(v) => list.update({ country: v })}
          allLabel={t('filter.allCountries')}
          options={(options?.nations ?? []).map((n) => ({ value: String(n.id), label: n.name ?? `#${n.id}` }))}
        />
        <FilterSelect
          value={list.values.level}
          onChange={(v) => list.update({ level: v })}
          allLabel={t('filter.allLevels')}
          className="w-36"
          options={(options?.levels ?? []).map((l) => ({ value: String(l), label: t('filter.level', { level: l }) }))}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-12" />
            <SortHead field="name" label={t('col.name')} state={sortState} />
            <SortHead field="country" label={t('col.country')} state={sortState} className="text-right" />
            <SortHead field="level" label={t('col.level')} state={sortState} className="text-center" />
            <SortHead field="team_count" label={t('col.teams')} state={sortState} className="text-center" />
            <SortHead field="id" label={t('col.id')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((l) => (
            <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leagues/${l.id}`)}>
              <TableCell>
                <BasketCheck
                  checked={l.in_basket}
                  label={l.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_league' : 'remove_league', args: { id: l.id } })}
                />
              </TableCell>
              <TableCell>
                <LeagueImage id={l.id} size={64} available={l.has_logo} className="size-8" />
              </TableCell>
              <TableCell data-grow>
                <div className="font-medium">{l.name}</div>
                {l.database_name && l.database_name !== l.name && <div className="text-xs text-muted-foreground">{l.database_name}</div>}
              </TableCell>
              <TableCell className="text-right">{l.country ?? '—'}</TableCell>
              <TableCell className="text-center tabular-nums">{l.level ?? '—'}</TableCell>
              <TableCell className="text-center tabular-nums">{l.team_count}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{l.id}</TableCell>
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

export function BasketFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      allLabel={t('filter.basketAny')}
      className="w-44"
      options={[
        { value: 'yes', label: t('filter.basketIn') },
        { value: 'no', label: t('filter.basketOut') },
      ]}
    />
  )
}
