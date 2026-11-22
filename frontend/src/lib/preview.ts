import type { PreviewKit } from '@/components/common/KitPreview'

/** What a player wears in the 3D preview: a kit of the game (team + kit type), with the crest, name and number the
 * game draws over it. No team = the model player in a grey kit. */
export function previewKit(token: string, team: number | null, kind: number, opts: { collar?: number; number?: number | null; name?: string | null } = {}): PreviewKit {
  const v = `v=${token}`
  const print = (part: 'jersey' | 'shorts') => {
    if (team === null) return null
    const q = new URLSearchParams({ part })
    if (opts.number != null) q.set('number', String(opts.number))
    if (opts.name) q.set('name', opts.name)
    return `/api/preview/kit-print/${team}/${kind}.png?${q}&${v}`
  }
  return {
    jersey: team === null ? null : `/api/image/kit/${team}/${kind}/jersey?${v}`,
    shorts: team === null ? null : `/api/image/kit/${team}/${kind}/shorts?${v}`,
    jerseyPrint: print('jersey'),
    shortsPrint: print('shorts'),
    collar: opts.collar ?? 0,
    goalkeeper: kind === 2,
  }
}
