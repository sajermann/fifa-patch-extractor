import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/api/client'
import type { EquipmentKind } from '@/api/types'
import { BasketCheck } from '@/components/common/detail'
import { EquipmentImage } from '@/components/common/pictures'
import { useI18n, type MessageKey } from '@/i18n'
import { usePageLabel } from '@/lib/back'
import { FilterBar, FilterSelect, LIST_PAGE, Pager, ScrollTable, SearchInput, SortHead, useListState } from '@/lib/list'
import { useBasketOp, useList } from '@/state/queries'
import { BasketFilter } from './LeaguesPage'

const FILTERS = ['q', 'used', 'in_basket'] as const

/** The size of each kind's picture in the list (a boot is wide, a glove and a ball are round-ish). */
const THUMB: Record<EquipmentKind, string> = { boots: 'h-7 w-14', gloves: 'size-8', balls: 'size-8' }

/** The boots, goalkeeper gloves or balls of the game (same list as the adboards): each with its picture, name, code
 * and who uses it. One can go alone in the package. */
export function EquipmentPage({ kind }: { kind: EquipmentKind }) {
  const { t } = useI18n()
  const k = (key: string, vars?: Record<string, string | number>) => t(`${kind}.${key}` as MessageKey, vars)
  usePageLabel(t(`nav.${kind}` as MessageKey))
  const list = useListState(FILTERS)
  const { data, isFetching } = useList(kind, list.request, (p) => api.equipment(kind, p))
  const op = useBasketOp()
  const sortState = { sort: list.sort, dir: list.dir, update: list.update, current: data?.sort ?? '', currentDir: data?.dir ?? '' }
  return (
    <div className={LIST_PAGE}>
      <div>
        <h1 className="text-2xl font-semibold">{k('title')}</h1>
        <p className="text-sm text-muted-foreground">{k('subtitle')}</p>
      </div>
      <FilterBar active={list.active} onClear={list.clear}>
        <SearchInput value={list.values.q} onChange={(v) => list.update({ q: v })} placeholder={k('search')} />
        <FilterSelect
          value={list.values.used}
          onChange={(v) => list.update({ used: v })}
          allLabel={k('usedAny')}
          options={[
            { value: 'yes', label: k('usedYes') },
            { value: 'no', label: k('usedNo') },
          ]}
        />
        <BasketFilter value={list.values.in_basket} onChange={(v) => list.update({ in_basket: v })} />
      </FilterBar>
      <ScrollTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-16" />
            <SortHead field="name" label={t('equipment.name')} state={sortState} />
            <SortHead field="id" label={t('equipment.code')} state={sortState} className="text-center" />
            <SortHead field="wearers" label={k('wearers')} state={sortState} className="text-center" />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? 'opacity-70' : undefined}>
          {data?.items.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <BasketCheck
                  checked={e.in_basket}
                  label={e.in_basket ? t('basket.remove') : t('basket.add')}
                  onChange={(v) => op.mutate({ op: v ? 'add_equipment' : 'remove_equipment', args: { kind, id: e.id } })}
                />
              </TableCell>
              <TableCell>
                <EquipmentImage kind={kind} code={e.id} size={128} className={`${THUMB[kind]} object-contain`} />
              </TableCell>
              <TableCell data-grow>
                <span className={e.name ? 'font-medium' : 'font-medium text-muted-foreground'}>
                  {e.name ?? t('equipment.unnamed', { code: e.id })}
                </span>
              </TableCell>
              <TableCell className="text-center tabular-nums">{e.id}</TableCell>
              <TableCell className="text-center tabular-nums">{e.wearers || '—'}</TableCell>
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
