import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import type { AdboardRow } from '@/api/types'
import { Badge, BasketCheck } from '@/components/common/detail'
import { AdboardImage } from '@/components/common/pictures'
import { useI18n } from '@/i18n'
import { usePageLabel } from '@/lib/back'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'

const FILTERS = ['q', 'kind', 'in_basket'] as const

/** The advertising boards of the game (same list as the stadiums): its own boards and the ones a patch's stadium
 * script names after a team, a tournament or a stadium. A board can go alone in the package. */
export function AdboardsPage() {
  const { t } = useI18n()
  usePageLabel(t('nav.adboards'))
  const list = useListState(FILTERS)
  const { data, isFetching } = useList('adboards', list.request, api.adboards)
  const op = useBasketOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  const any = (v: number | null) => (v === null ? t('adboards.any') : String(v))
  const what = (b: AdboardRow) =>
    b.kind === 'game'
      ? t('adboards.gameBoard', { number: b.number ?? '?' })
      : [
          t('adboards.team', { team: b.team ?? any(b.team_id) }),
          t('adboards.tournament', { tournament: b.league ? `${b.league} (${b.tournament})` : any(b.tournament) }),
          t('adboards.stadium', { stadium: any(b.stadium) }),
          t('adboards.variant', { variant: b.variant ?? 0 }),
        ].join(' · ')
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{t('adboards.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('adboards.subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={t('adboards.search')} />
        <FilterSelect
          value={list.values.kind}
          onChange={(v) => list.update({ kind: v })}
          allLabel={t('adboards.kindAll')}
          options={[
            { value: 'game', label: t('adboards.kindGame') },
            { value: 'specific', label: t('adboards.kindSpecific') },
          ]}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-12" />
            <SortHead field="id" label={t('adboards.file')} state={sortState} />
            <SortHead field="kind" label={t('adboards.kind')} state={sortState} className="text-center" />
            <TableHead>{t('adboards.what')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <BasketCheck
                  checked={b.in_basket}
                  label={b.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_adboard' : 'remove_adboard', args: { id: b.id } })}
                />
              </TableCell>
              <TableCell>
                <AdboardImage name={b.id} size={64} className="aspect-[1/2] w-5 rounded border object-cover" />
              </TableCell>
              <TableCell data-grow className="font-medium">
                {b.id}
              </TableCell>
              <TableCell className="text-center">
                <Badge>{b.kind === 'game' ? t('adboards.kindGame') : t('adboards.kindSpecific')}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{what(b)}</TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
