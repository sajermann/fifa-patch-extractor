import { useQuery } from '@tanstack/react-query'
import { ScanFace, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import { Badge, BasketCheck, OverallBadge } from '@/components/common/detail'
import { Flag, Photo } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList, useOptions, useToken } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'

const FILTERS = ['q', 'team', 'league', 'nation', 'position', 'min_overall', 'face', 'in_basket'] as const
const OVERALLS = [90, 85, 80, 75, 70, 65, 60]

export function PlayersPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('players', list.request, api.players)
  const options = useOptions().data
  const op = useBasketOp()
  const token = useToken()
  const teamId = Number(list.values.team) || null
  const teamName = useQuery({ queryKey: ['lookup', token, 'teams', teamId], queryFn: () => api.lookup('teams', [teamId!]), enabled: !!teamId && !!token }).data?.[0]?.name
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('players.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('players.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('players.search')} />
        {teamId && (
          <Button variant="secondary" size="sm" onClick={() => list.update({ team: null })}>
            {t('players.teamFilter', { name: teamName ?? `#${teamId}` })} <X />
          </Button>
        )}
        <FilterSelect
          value={list.values.league}
          onChange={(v) => list.update({ league: v })}
          allLabel={t('filter.allLeagues')}
          className="w-52"
          options={(options?.leagues ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
        />
        <FilterSelect
          value={list.values.nation}
          onChange={(v) => list.update({ nation: v })}
          allLabel={t('filter.allNations')}
          className="w-44"
          options={(options?.nations ?? []).map((n) => ({ value: String(n.id), label: n.name ?? `#${n.id}` }))}
        />
        <FilterSelect
          value={list.values.position}
          onChange={(v) => list.update({ position: v })}
          allLabel={t('filter.allPositions')}
          className="w-36"
          options={(options?.positions ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
        />
        <FilterSelect
          value={list.values.min_overall}
          onChange={(v) => list.update({ min_overall: v })}
          allLabel={t('filter.anyOverall')}
          className="w-36"
          options={OVERALLS.map((o) => ({ value: String(o), label: t('filter.overallAtLeast', { value: o }) }))}
        />
        <FilterSelect
          value={list.values.face}
          onChange={(v) => list.update({ face: v })}
          allLabel={t('filter.faceAny')}
          className="w-40"
          options={[
            { value: 'yes', label: t('filter.faceYes') },
            { value: 'no', label: t('filter.faceNo') },
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
            <SortHead field="overall" label={t('col.overall')} state={sortState} />
            <SortHead field="potential" label={t('col.potential')} state={sortState} />
            <SortHead field="position_code" label={t('col.position')} state={sortState} />
            <SortHead field="age" label={t('col.age')} state={sortState} />
            <SortHead field="nationality" label={t('col.nationality')} state={sortState} />
            <SortHead field="team" label={t('col.team')} state={sortState} />
            <SortHead field="id" label={t('col.id')} state={sortState} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((p) => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/players/${p.id}`)}>
              <TableCell>
                <BasketCheck
                  checked={p.in_basket}
                  label={p.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_players' : 'remove_players', args: { ids: [p.id] } })}
                />
              </TableCell>
              <TableCell>
                <Photo id={p.id} size={64} available={p.has_photo} className="size-9 rounded" />
              </TableCell>
              <TableCell data-grow>
                <div className="flex items-center gap-2 font-medium">
                  {p.name}
                  {p.has_face && (
                    <span title={t('players.hasFace')}>
                      <ScanFace className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <OverallBadge value={p.overall} />
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{p.potential ?? '—'}</TableCell>
              <TableCell>{p.position ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{p.birthdate_suspect ? <Badge tone="warn">?</Badge> : (p.age ?? '—')}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <Flag id={p.nationality_id} className="h-3.5 w-5" />
                  {p.nationality ?? '—'}
                </span>
              </TableCell>
              <TableCell>{p.team ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{p.id}</TableCell>
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
