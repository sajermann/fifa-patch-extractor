import { FolderOpen, Heart, Loader2, Package, Settings, Shield, Trophy, Users } from 'lucide-react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n, type MessageKey } from '@/i18n'
import { APP_NAME, APP_VERSION, AUTHOR_GITHUB, AUTHOR_NAME, DONATE_URL, REPO_URL } from '@/lib/about'
import { cn } from '@/lib/utils'
import { useStatus } from '@/state/queries'
import { LoadingBlock } from './LoadingBlock'

const NAV: { to: string; label: MessageKey; icon: typeof Trophy; count?: 'leagues' | 'teams' | 'players' }[] = [
  { to: '/leagues', label: 'nav.leagues', icon: Trophy },
  { to: '/teams', label: 'nav.teams', icon: Shield },
  { to: '/players', label: 'nav.players', icon: Users },
]

function NavItem({ to, label, icon: Icon, extra }: { to: string; label: MessageKey; icon: typeof Trophy; extra?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <NavLink to={to} className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent', isActive && 'bg-accent font-medium')}>
      <Icon className="size-4" />
      <span className="flex-1">{t(label)}</span>
      {extra}
    </NavLink>
  )
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className="size-4">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/** Pages that need a loaded game: they show it loading, or send the user to the game folder screen. */
export function RequireSource() {
  const { t } = useI18n()
  const source = useStatus().data?.source
  if (!source) return <LoadingBlock />
  if (source.state === 'loading')
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t('source.loading', { path: source.path ?? '' })}
      </div>
    )
  if (source.state !== 'ready') return <Navigate to="/source" replace />
  return <Outlet />
}

export function AppShell() {
  const { t } = useI18n()
  const status = useStatus().data
  const { pathname } = useLocation()
  const basket = status?.basket
  const total = basket ? basket.leagues + basket.teams + basket.players : 0
  const source = status?.source
  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 p-3">
        <div className="mb-6 flex items-center gap-2 px-3 pt-2">
          <img src="/favicon.png" alt="" className="size-7" />
          <div>
            <p className="text-sm font-semibold leading-tight">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">{t('app.subtitle')}</p>
          </div>
        </div>
        <nav className="space-y-1">
          <NavItem to="/source" label="nav.source" icon={FolderOpen} extra={source?.state === 'loading' ? <Loader2 className="size-3.5 animate-spin" /> : undefined} />
          <div className="my-2 border-t" />
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} extra={source?.counts ? <span className="text-xs text-muted-foreground tabular-nums">{source.counts[n.to.slice(1) as 'leagues' | 'teams' | 'players']}</span> : undefined} />
          ))}
          <div className="my-2 border-t" />
          <NavItem
            to="/export"
            label="nav.export"
            icon={Package}
            extra={total > 0 ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{basket!.players || total}</span> : undefined}
          />
        </nav>
        <div className="mt-auto space-y-2">
          <NavItem to="/settings" label="nav.settings" icon={Settings} />
          <div className="space-y-0.5 px-3 pt-2 text-xs text-muted-foreground">
            <p className="flex items-center justify-between gap-2">
              <span>
                {t('app.credits')}{' '}
                <a href={AUTHOR_GITHUB} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
                  {AUTHOR_NAME}
                </a>
              </span>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={REPO_URL} target="_blank" rel="noreferrer" title={t('app.sourceCode')} aria-label={t('app.sourceCode')}>
                  <GithubMark />
                </a>
              </Button>
            </p>
            <p>
              {t('app.version')} {APP_VERSION}
            </p>
            <Button variant="outline" size="sm" className="mt-2 w-full" asChild>
              <a href={DONATE_URL} target="_blank" rel="noreferrer">
                <Heart className="text-rose-500" /> {t('app.donate')}
              </a>
            </Button>
          </div>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-10 flex shrink-0 items-center gap-3 border-b bg-background/95 px-6 py-3 text-sm backdrop-blur">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {source?.state === 'ready' ? (
              <>
                <span className="font-medium text-foreground">{t('header.game')}</span> <span className="font-mono text-xs">{source.game_dir}</span>
              </>
            ) : source?.state === 'loading' ? (
              t('source.loading', { path: source.path ?? '' })
            ) : (
              t('header.noGame')
            )}
          </span>
          {basket && total > 0 && (
            <NavLink to="/export" className="text-xs text-muted-foreground hover:text-foreground">
              {t('header.basket', { leagues: basket.leagues, teams: basket.teams, players: basket.players })}
            </NavLink>
          )}
        </header>
        <main key={pathname.split('/')[1]} className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
