# FIFA Patch Extractor

Browse the database of a **FIFA 14 (PC)** installation — clean or with a patch — and export the leagues, teams and
players you pick as a neutral **package** (`.fifapkg.zip`), with their pictures, kits, fonts and real faces.

The package keeps every value **exactly as the game has it**: the extractor does not know, and does not care, which
tool will read it. Converting the data for another game or another patch is the job of whoever imports the package.
The format is documented in [PACKAGE_FORMAT.md](PACKAGE_FORMAT.md).

- One screen per kind of data: **Leagues**, **Teams**, **Players**, each with a detail page (names, pictures, kits,
  squad, ratings, appearance codes and the raw database row).
- Lists are paged, filtered and sorted on the server; the state of every screen lives in the URL.
- An **export basket** goes across the screens: a league brings its teams, a team brings its squad (or the players
  you tick), a player can go alone. Baskets can be saved under a name.
- Reads loose files and the game's `.big` archives (`chunkzip`/`chunkref` containers). **The game folder is only
  read, never written.**

> Independent fan-made tool. Not affiliated with, sponsored or endorsed by Electronic Arts or FIFA; "FIFA" and
> "EA SPORTS" are trademarks of their respective owners. The app contains no game files: it only reads the
> installation you provide. Content you export — including content from patches made by other people — belongs to
> its authors: keep their credits when you share it.

## Use

Download the installer or the portable zip from the **Releases** page, open the app, choose the game folder and browse.

## Development

Python 3.12+ and Node 22+:

```
start.bat
```

or by hand: `python -m fpxapi` in `backend/` (API on http://localhost:8772) and `npm run dev` in `frontend/`
(http://localhost:5176).

- `core/fpx/` — reading the game (no web): `gamefs` (loose files + BIG archives), `chunk`, `big`, `t3db` (database),
  `rx3`, `images`, `kitfonts`, `fifa14` (where everything lives in FIFA 14) and `package` (the export).
- `backend/fpxapi/` — FastAPI: lists, details, pictures, basket, saved selections, export jobs.
- `frontend/` — React + Vite + TypeScript + Tailwind + shadcn/ui; texts in `src/i18n/` (pt-BR and English).
- `desktop/` — Tauri packaging (see [desktop/README.md](desktop/README.md)).

Tests use a small invented game built by the tests themselves (`core/tests/fakegame.py`), never a real one:

```
cd core && python -m pytest -q
cd backend && python -m pytest -q
```

Before publishing, `python tools/check_clean.py` checks that no game file, absolute path or private note slipped
into the repository.

## License

GPL v3 with an attribution term — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Suggestions and questions are
welcome in the Discussions tab ([CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Português

Navegue pelo banco de uma instalação do **FIFA 14 (PC)** — limpa ou com patch — e exporte as ligas, times e
jogadores que escolher num **pacote** neutro (`.fifapkg.zip`), com imagens, uniformes, fontes e faces reais.

O pacote leva tudo **do jeito que o jogo tem**: o extrator não sabe para qual ferramenta está exportando. Converter os
dados para outro jogo ou outro patch é trabalho de quem importa o pacote. O formato está em
[PACKAGE_FORMAT.md](PACKAGE_FORMAT.md).

- Uma tela para cada coisa (**Ligas**, **Times**, **Jogadores**), com página de detalhe.
- Listas paginadas, filtradas e ordenadas no servidor; o estado de cada tela fica na URL.
- **Cesta de exportação** que atravessa as telas; cestas podem ser salvas com um nome.
- Lê arquivos soltos e os `.big` do jogo. **A pasta do jogo só é lida, nunca alterada.**

> Ferramenta independente feita por fãs. Não é afiliada, patrocinada nem aprovada pela Electronic Arts nem pela FIFA.
> O app não traz nenhum arquivo do jogo: ele só lê a instalação que você tem. O conteúdo exportado (inclusive o de
> patches feitos por outras pessoas) pertence aos seus autores: respeite os créditos ao compartilhar.
