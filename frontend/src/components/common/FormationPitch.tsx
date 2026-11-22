import type { Formation, RosterRow } from '@/api/types'

// The team's formation drawn on a pitch (own goal at the bottom): each of the 11 places at the x/y the game keeps in
// the team's formations row, with its position and the starter there (the squad player whose position is that code).

export function FormationPitch({ formation, roster }: { formation: Formation; roster: RosterRow[] }) {
  const used = new Set<number>()
  const starters = formation.positions.map((p) => {
    const found = roster.find((r) => r.link_position === p.code && !used.has(r.id))
    if (found) used.add(found.id)
    return found
  })
  return (
    <div className="relative aspect-[68/105] w-full overflow-hidden rounded-md bg-emerald-700 dark:bg-emerald-900">
      <svg viewBox="0 0 68 105" className="absolute inset-0 size-full" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4">
        <rect x="1.5" y="1.5" width="65" height="102" />
        <line x1="1.5" y1="52.5" x2="66.5" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <rect x="13.85" y="1.5" width="40.3" height="16.5" />
        <rect x="13.85" y="87" width="40.3" height="16.5" />
        <rect x="24.85" y="1.5" width="18.3" height="5.5" />
        <rect x="24.85" y="98" width="18.3" height="5.5" />
      </svg>
      {formation.positions.map((p, i) => {
        const player = starters[i]
        const x = (p.x ?? 0.5) * 100
        const y = (1 - (p.y ?? 0.5)) * 100
        return (
          <div key={i} className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-background text-[10px] font-bold text-foreground shadow tabular-nums">
              {player?.jersey_number ?? '·'}
            </span>
            <span className="mt-0.5 rounded bg-black/55 px-1 text-[10px] leading-tight text-white">
              {p.name ?? p.code}
              {player && <span className="block max-w-24 truncate font-medium">{player.name}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
