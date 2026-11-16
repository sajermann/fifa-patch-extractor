import { ImageOff, Shield, User } from 'lucide-react'
import { useState } from 'react'
import { useToken } from '@/state/queries'
import { cn } from '@/lib/utils'

/** Picture of the loaded game (the URL carries the game's token); a missing or broken file shows `fallback`. */
function GameImage({ url, alt, className, fallback, available = true }: { url: string; alt: string; className?: string; fallback: React.ReactNode; available?: boolean }) {
  const token = useToken()
  const [failed, setFailed] = useState<string | null>(null)
  const src = `${url}${url.includes('?') ? '&' : '?'}v=${token}`
  if (!available || failed === src) return <span className={cn('inline-flex items-center justify-center text-muted-foreground/50', className)}>{fallback}</span>
  return <img src={src} alt={alt} loading="lazy" className={cn('object-contain', className)} onError={() => setFailed(src)} />
}

export function Crest({ id, size = 64, className, noBackground, available }: { id: number; size?: number; className?: string; noBackground?: boolean; available?: boolean }) {
  return (
    <GameImage
      url={`/api/image/crest/${id}?size=${size}${noBackground ? '&nobg=true' : ''}`}
      alt=""
      className={className}
      available={available}
      fallback={<Shield className="size-1/2" />}
    />
  )
}

export function Photo({ id, size = 64, className, available }: { id: number; size?: number; className?: string; available?: boolean }) {
  return <GameImage url={`/api/image/photo/${id}?size=${size}`} alt="" className={className} available={available} fallback={<User className="size-1/2" />} />
}

export function LeagueImage({ id, kind = 'logo', size, className, available }: { id: number; kind?: 'logo' | 'banner'; size?: number; className?: string; available?: boolean }) {
  return (
    <GameImage url={`/api/image/league/${id}/${kind}${size ? `?size=${size}` : ''}`} alt="" className={className} available={available} fallback={<ImageOff className="size-1/2" />} />
  )
}

export function Flag({ id, className }: { id: number | null; className?: string }) {
  if (id === null) return null
  return <GameImage url={`/api/image/flag/${id}?size=32`} alt="" className={className} fallback={null} />
}

export function KitImage({ team, type, part, size, className }: { team: number; type: number; part: 'jersey' | 'shorts'; size?: number; className?: string }) {
  return (
    <GameImage url={`/api/image/kit/${team}/${type}/${part}${size ? `?size=${size}` : ''}`} alt="" className={className} fallback={<ImageOff className="size-1/3" />} />
  )
}

export function ColorDot({ rgb, className }: { rgb: (number | null)[] | null | undefined; className?: string }) {
  if (!rgb || rgb.some((v) => v === null)) return null
  return <span className={cn('inline-block size-4 rounded-full border', className)} style={{ background: `rgb(${rgb.join(',')})` }} title={`RGB ${rgb.join(', ')}`} />
}
