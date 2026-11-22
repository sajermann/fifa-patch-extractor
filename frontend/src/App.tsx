import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/api/client'
import { AppShell, RequireSource } from '@/components/layout/AppShell'
import { I18nProvider, useI18n } from '@/i18n'
import { ThemeProvider } from '@/lib/theme'
import { ExportPage } from '@/pages/ExportPage'
import { LeaguePage } from '@/pages/LeaguePage'
import { LeaguesPage } from '@/pages/LeaguesPage'
import { NationPage } from '@/pages/NationPage'
import { NationsPage } from '@/pages/NationsPage'
import { PlayerPage } from '@/pages/PlayerPage'
import { PlayersPage } from '@/pages/PlayersPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StadiumPage } from '@/pages/StadiumPage'
import { StadiumsPage } from '@/pages/StadiumsPage'
import { SourcePage } from '@/pages/SourcePage'
import { TeamPage } from '@/pages/TeamPage'
import { TeamsPage } from '@/pages/TeamsPage'
import { useStatus } from '@/state/queries'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } })

/** The interface language saved in the backend wins when the app opens; the first choice is saved there. */
function LanguageSync() {
  const { lang, setLang } = useI18n()
  const config = useStatus().data?.config
  const applied = useRef(false)
  useEffect(() => {
    if (!config || applied.current) return
    applied.current = true
    if (config.language && config.language !== lang) setLang(config.language)
    else if (!config.language) void api.saveSettings({ language: lang }).catch(() => undefined)
  }, [config, lang, setLang])
  return null
}

function Home() {
  const source = useStatus().data?.source
  if (!source) return null
  return <Navigate to={source.state === 'empty' || source.state === 'error' ? '/source' : '/leagues'} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <LanguageSync />
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="source" element={<SourcePage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="export" element={<ExportPage />} />
                  <Route element={<RequireSource />}>
                    <Route path="nations" element={<NationsPage />} />
                    <Route path="nations/:id" element={<NationPage />} />
                    <Route path="leagues" element={<LeaguesPage />} />
                    <Route path="leagues/:id" element={<LeaguePage />} />
                    <Route path="teams" element={<TeamsPage />} />
                    <Route path="teams/:id" element={<TeamPage />} />
                    <Route path="players" element={<PlayersPage />} />
                    <Route path="players/:id" element={<PlayerPage />} />
                    <Route path="stadiums" element={<StadiumsPage />} />
                    <Route path="stadiums/:id" element={<StadiumPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
