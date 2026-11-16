# Frontend

React + Vite + TypeScript + Tailwind + shadcn/ui. Code is English; the UI is translated (pt-BR and English).

- **Languages** (`src/i18n/`): flat dictionaries `pt-BR.ts` (the reference) and `en.ts` (typed: a missing key fails
  `tsc`). Components use `const { t } = useI18n()`; code outside React uses `translate()`. Backend errors are
  translated by their `code` (`apiError.<code>`). The choice is saved in the backend's settings and in the browser.
- **Lists** (`src/lib/list.tsx`): every filter, the sort and the page live in the URL (`useListState`) and go to the
  backend as they are — nothing is filtered or paged in the browser. Detail pages keep their tab in the URL too
  (`src/lib/tabs.tsx`).
- **Pictures** (`src/components/common/pictures.tsx`): URLs carry the token of the loaded game (`?v=`), so the
  browser cache never mixes two games.
- **Dialogs**: always `components/ui/dialog.tsx`; width only through the `width` prop (`sm`, `md`, `lg`).
- **Theme** (`src/lib/theme.tsx`): light / dark / system, class `dark` on `<html>`, saved in `fpx.theme`.

- `npm run dev` — dev server on http://localhost:5176 (proxies `/api` to the backend on port 8772).
- `npm run build` — builds `dist/`, served by the backend at `/`.
