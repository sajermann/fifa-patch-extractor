import { useNavigate } from 'react-router-dom'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { BasketCheck, OverallBadge } from '@/components/common/detail'
import { ColorDot, Crest } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'

const FILTERS = ['q', 'league', 'kits', 'national', 'in_basket'] as const

export function TeamsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('teams', list.request, api.teams)
  const options = useOptions().data
  const op = useBasketOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('teams.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('teams.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('teams.search')} />
        <FilterSelect
          value={list.values.league}
          onChange={(v) => list.update({ league: v })}
          allLabel={t('filter.allLeagues')}
          className="w-56"
          options={(options?.leagues ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
        />
        <FilterSelect
          value={list.values.kits}
          onChange={(v) => list.update({ kits: v })}
          allLabel={t('filter.kitsAny')}
          className="w-44"
          options={[
            { value: 'yes', label: t('filter.kitsYes') },
            { value: 'no', label: t('filter.kitsNo') },
          ]}
        />
        <FilterSelect
          value={list.values.national}
          onChange={(v) => list.update({ national: v })}
          allLabel={t('filter.teamKindAny')}
          className="w-44"
          options={[
            { value: 'no', label: t('filter.clubs') },
            { value: 'yes', label: t('filter.nationalTeams') },
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
            <SortHead field="league" label={t('col.league')} state={sortState} />
            <SortHead field="overall" label={t('col.overall')} state={sortState} />
            <SortHead field="player_count" label={t('col.players')} state={sortState} />
            <SortHead field="kit_count" label={t('col.kits')} state={sortState} />
            <TableHead>{t('col.colors')}</TableHead>
            <SortHead field="id" label={t('col.id')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((tm) => (
            <TableRow key={tm.id} className="cursor-pointer" onClick={() => navigate(`/teams/${tm.id}`)}>
              <TableCell>
                <BasketCheck
                  checked={tm.in_basket}
                  label={tm.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_team' : 'remove_team', args: { id: tm.id } })}
                />
              </TableCell>
              <TableCell>
                <Crest id={tm.id} size={64} available={tm.has_crest} className="size-8" />
              </TableCell>
              <TableCell data-grow>
                <div className="font-medium">
                  {tm.name} {tm.abbr3 && <span className="ml-1 text-xs text-muted-foreground">{tm.abbr3}</span>}
                </div>
                {tm.in_basket && tm.basket_players !== tm.player_count && (
                  <div className="text-xs text-muted-foreground">{t('teams.inBasketPlayers', { count: tm.basket_players, total: tm.player_count })}</div>
                )}
              </TableCell>
              <TableCell>{tm.national_team_of !== null ? t('teams.nationalTeam') : (tm.league ?? '—')}</TableCell>
              <TableCell>
                <OverallBadge value={tm.overall} />
              </TableCell>
              <TableCell className="tabular-nums">{tm.player_count}</TableCell>
              <TableCell className="tabular-nums">{tm.kit_count}</TableCell>
              <TableCell>
                <ColorDot rgb={tm.primary_color} />
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{tm.id}</TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
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
