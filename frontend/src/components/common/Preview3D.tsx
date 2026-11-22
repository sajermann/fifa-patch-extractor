import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { api } from '@/api/client'
import { useToken } from '@/state/queries'
import type { PreviewKit, View } from './KitPreview'

const KitPreview = lazy(() => import('./KitPreview')) // three.js only loads when a preview is on screen

/** The 3D preview in its frame: player `wearer` (his head, face, hair, height; 0 = the model player) wearing `kit`. */
export function Preview3D({ kit, wearer, initialView = 'body', className }: { kit: PreviewKit; wearer: number; initialView?: View; className?: string }) {
  const token = useToken()
  const look = useQuery({ queryKey: ['preview-look', token, wearer], queryFn: () => api.previewLook(wearer), enabled: !!token, staleTime: Infinity }).data
  return (
    <div className={className ?? 'aspect-[3/4] w-full overflow-hidden rounded-md bg-gradient-to-b from-muted to-background'}>
      <Suspense
        fallback={
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        }
      >
        <KitPreview kit={kit} look={look} initialView={initialView} />
      </Suspense>
    </div>
  )
}
