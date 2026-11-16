import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ListParams } from '@/api/client'
import type { BasketCounts } from '@/api/types'
import { toast } from 'sonner'

/** The backend status; polled while a game loads. */
export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: (q) => (q.state.data?.source.state === 'loading' ? 500 : false),
  })
}

/** The token of the loaded game: part of every query key and picture URL, so another game never mixes in. */
export function useToken() {
  return useStatus().data?.source.token ?? ''
}

export function useSourceReady() {
  const s = useStatus().data?.source
  return s?.state === 'ready'
}

export function useList<T>(kind: 'leagues' | 'teams' | 'players', params: ListParams, fetcher: (p: ListParams) => Promise<T>) {
  const token = useToken()
  return useQuery({ queryKey: [kind, token, params], queryFn: () => fetcher(params), placeholderData: keepPreviousData, enabled: !!token })
}

export function useOptions() {
  const token = useToken()
  return useQuery({ queryKey: ['options', token], queryFn: api.options, enabled: !!token, staleTime: Infinity })
}

export function useBasketView() {
  const token = useToken()
  return useQuery({ queryKey: ['basket', token], queryFn: api.basket })
}

/** A basket operation; every list, detail and count refreshes after it. */
export function useBasketOp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ op, args }: { op: string; args?: Record<string, unknown> }) => api.basketOp(op, args),
    onSuccess: (counts: BasketCounts) => {
      qc.setQueryData(['status'], (s: unknown) => (s && typeof s === 'object' ? { ...s, basket: counts } : s))
      for (const key of ['leagues', 'teams', 'players', 'league', 'team', 'player', 'basket']) void qc.invalidateQueries({ queryKey: [key] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
