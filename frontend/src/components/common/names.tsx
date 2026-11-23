import { hasMessage, useI18n, type MessageKey } from '@/i18n'

/** The names of a country or league in every language of the game, read-only: the same grid as the FIFA 14 Studio's
 * Names, without the fields to edit. `columns` = the name keys in the order shown; `prefix` = the i18n prefix of their
 * labels (e.g. `nationName`). It fills the box it is in and scrolls inside it, with the header always on top. */
export function LanguageNames({ columns, prefix, names }: { columns: string[]; prefix: string; names: Record<string, Record<string, string>> }) {
  const { t } = useI18n()
  const shown = columns // every column, even when the game has no text in it (as the FIFA 14 Studio's grid)
  const languages = [...new Set(Object.values(names).flatMap((byLang) => Object.keys(byLang)))].sort()
  const label = (key: string) => (hasMessage(`${prefix}.${key}`) ? t(`${prefix}.${key}` as MessageKey) : key)
  if (!languages.length) return <p className="text-sm text-muted-foreground">{t('names.none')}</p>
  return (
    <table className="w-full text-sm">
      <colgroup>
        <col className="w-24" />
        {shown.map((key) => (
          <col key={key} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 shadow-[0_1px_0_var(--border)] [&_th]:bg-card">
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-2 py-2 font-medium">{t('names.language')}</th>
          {shown.map((key) => (
            <th key={key} className="px-2 py-2 font-medium">
              {label(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {languages.map((code) => (
          <tr key={code} className="border-b last:border-0">
            <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{code}</td>
            {shown.map((key) => (
              <td key={key} className="px-2 py-1.5">
                {names[key]?.[code] ?? <span className="text-muted-foreground">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
