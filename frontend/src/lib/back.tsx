import { ArrowLeft } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { Button } from '@/components/ui/button'

// The "←" of a detail page says where it goes, like the Studios' (the list, or the item opened before): every page tells its
// name (usePageLabel) and the app keeps the trail of pages visited in this tab, so the button shows the previous
// page's name and goes back to it (with its filters and tab). Opened by a direct link: the fallback list.

type Entry = { key: string; label?: string }
let trail: Entry[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Keeps the trail in step with the router (mounted once, in the app shell). */
export function TrailTracker() {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const at = trail.findIndex((e) => e.key === location.key)
    if (at >= 0) trail = trail.slice(0, at + 1) // back (or forward to a page still in the trail)
    else if (type === 'REPLACE' && trail.length) trail = [...trail.slice(0, -1), { key: location.key, label: trail[trail.length - 1].label }]
    else if (type === 'POP') trail = [{ key: location.key }] // a page outside the trail: start again
    else trail = [...trail, { key: location.key }]
    emit()
  }, [location.key, type])
  return null
}

/** The current page's name in the trail (what the next page's "←" shows). */
export function usePageLabel(label: string | null | undefined) {
  const { key } = useLocation()
  useEffect(() => {
    if (!label) return
    const entry = trail.find((e) => e.key === key)
    if (entry && entry.label !== label) {
      entry.label = label
      emit()
    }
  }, [key, label])
}

function usePrevious() {
  const { key } = useLocation()
  return useSyncExternalStore(subscribe, () => {
    const at = trail.findIndex((e) => e.key === key)
    return at > 0 ? trail[at - 1] : undefined
  })
}

/** "← <previous page>": back to where the user came from, or to `fallback` (a list) when opened by a direct link. */
export function BackButton({ fallback }: { fallback: { to: string; label: string } }) {
  const navigate = useNavigate()
  const previous = usePrevious()
  return (
    <Button variant="ghost" size="sm" className="self-start" onClick={() => (previous ? navigate(-1) : navigate(fallback.to))}>
      <ArrowLeft /> {previous?.label ?? fallback.label}
    </Button>
  )
}
