# Package format (`fifa-patch-package`, version 1)

A package is one zip file (`*.fifapkg.zip`) with the countries, leagues, teams, players and stadiums picked from a FIFA PC installation,
**exactly as the source game has them**. The extractor never adapts a value to any other game or tool: whoever
imports a package decides how to use each value (convert codes, clean names, resize pictures...).

## Layout

```
package.json                       the manifest (below)
leagues/<id>/logo.png, banner.png  league pictures, decoded
leagues/<id>/adboards/<stadium>_<variant>.png             advertising boards of the league, decoded
teams/<id>/crest.png               crest, decoded (crest-no-background.png when asked)
teams/<id>/kits/<type>/jersey.png  kit textures, decoded (shorts.png beside it)
teams/<id>/adboards/<tournament>_<stadium>_<variant>.png  advertising boards of the team, decoded
players/<id>/photo.png             player photo, decoded
nations/<id>/flag.png              flag, decoded
stadiums/<id>/picture-<n>.png      stadium picture of the menus, decoded (n = the game's picture variant)
adboards/<file name>.png           advertising board picked on its own, decoded
balls/<id>/picture.png             the ball's picture of the match settings, decoded
game/<game path>                   files as the game reads them (chunked containers already unpacked):
                                   always the fonts, face, stadium scene, boot, glove and ball files; the original pictures,
                                   kits and the other flag files too when "includes_originals" is true
```

`<id>` is always the id of the source database. `<game path>` is the path inside the game folder, lower case with
`/` separators (e.g. `game/data/sceneassets/kit/kit_1_0_0.rx3`).

## `package.json`

```jsonc
{
  "format": "fifa-patch-package",
  "format_version": 1,                 // a reader refuses versions newer than the ones it knows
  "source": {
    "game": "fifa14", "platform": "pc",
    "patch_name": "…" | null,          // typed by the user
    "language": "eng_us",              // language database the names were read from
    "database_from": "loose" | "<archive>.big"
  },
  "tool": { "name": "fifa-patch-extractor", "version": "0.1.0" },
  "created_at": "2026-01-01T12:00:00+00:00",
  "includes_originals": true,
  "includes_stadiums": true,           // the stadiums of the exported teams went too
  "includes_adboards": true,           // the boards of the exported teams and leagues went too
  "includes_equipment": true,          // the boots, gloves and balls of the exported players and teams went too
                                       // (the ones picked on their own go anyway)
  "credits": { "text": "…", "url": "https://…" } | null,
  "leagues": [League], "teams": [Team], "players": [Player], "nations": [Nation], "stadiums": [Stadium],
  "adboards": [Adboard],
  "boots": [Equipment], "gloves": [Equipment], "balls": [Equipment]
}
```

Every item has `source_id` and `raw`: `{table name: [rows]}` with the database rows that belong to it, every column,
values as stored (integers already include the field's range offset, as the game uses them).

### League

| field | meaning |
|---|---|
| `names` | every name the game has: `database` (the `leagues` row), `full`, `abbr15`, `abbr`, `trophy`, `trophy_abbr15` (language database; missing ones left out) |
| `level`, `country_nation_id` | from the `leagues` row |
| `team_ids` | every team of the league in the source (not only the exported ones) |
| `images` | `{logo, banner}` → `{image, source_path, original?}` |
| `adboards[]` | `{image, source_path, original?, stadium, variant}`: the board files a patch's stadium script names after a tournament id equal to the league's id, for any team (`specificadboard_0_<league>_<stadium>_<variant>.rx3`; `stadium` null = any). Empty in the clean game (it picks its boards from a table of its executable) |
| `raw` | rows with this `leagueid` (`leagues`, `leagueteamlinks`, ...) |

### Team

| field | meaning |
|---|---|
| `names` | `database`, `full`, `abbr15`, `abbr10`, `abbr7`, `abbr3`, `commentary` |
| `colors` | `{primary, secondary, tertiary}` as `[r, g, b]` |
| `league_ids` | every league of the team in the source |
| `national_team_of` | nation id when the team is a national team |
| `crest` | `{image, source_path, original?, image_no_background?, preferred?}` (`preferred: "no_background"` when the user asked for it) |
| `kits[]` | `type` (kit type id), `role` (`home`, `away`, `goalkeeper` or null), `jersey`, `shorts`, `source_path`, `original?`, `print_positions` (8 rectangles `[u0, v0, u1, v1]`: crest, back number, front number, name, name arc center, name arc tangent, shorts crest, shorts number), `colors`, `name_color`, `name_font {id, file?, family_name?}`, `name_layout`, `name_case`, `back_name_placement`, `number_font {id, color, file?, ink_color?}`, `front_number_placement`, `shorts_number_font {…}`, `shorts_number_placement`, `collar` |
| `roster[]` | the exported players: `player_id`, `jersey_number`, `position` (the game's code, 28 = substitute, 29 = reserve), `position_name` |
| `formation` | `{id, name, base, positions[]}`: the team's `formations` row (base = which of the game's generic formations; each position `{code, name, x, y}`, 0-1 with the own goal at y 0), or null |
| `adboards[]` | `{image, source_path, original?, tournament, stadium, variant}`: the board files a patch's stadium script names after the team (`specificadboard_<team>_<tournament>_<stadium>_<variant>.rx3`; `tournament` / `stadium` null = any). Empty in the clean game |
| `adboard_tournament_id` | the tournament the patch's script gives the team (`assignTeamTournament` in `data/fifarna/lua/assignments/teams/team_<id>.lua`), or null. Its meaning is the patch's (a league id, an era…) |
| `stadium_ids`, `stadium_custom_name` | stadiums of the team in the source (`teamstadiumlinks`) and the name it gives its stadium (`stadiumassignments`), or null |
| `captain_id`, `takers` | ids as in the database (`penalty`, `free_kick`, `long_free_kick`, `left_corner`, `right_corner`); they may point to players that are not in the package |
| `raw` | rows with this `teamid` (only the exported `teamplayerlinks`) + every `teamkits` row of the team |

`ink_color` is the color the number font file really shows (some club fonts ignore the palette index).

### Player

| field | meaning |
|---|---|
| `names` | `first`, `last`, `common`, `jersey` (edited names of the database win; accents kept) |
| `birthdate`, `birthdate_suspect` | ISO date; suspect = the same date is shared by more than 20% of the players (a placeholder) |
| `height`, `weight`, `preferred_foot` | as in the database (`right` / `left`) |
| `positions[]` | `{code, name}` of the preferred positions |
| `nationality_id` | nation id of the source (see `nations`) |
| `traits` | the trait keys the player has (bits of `trait1`/`trait2`: `leadership`, `finesse_shot`, ...) |
| `attributes` | ratings with neutral names (`acceleration`, `sprint_speed`, `finishing`, ..., `overall`, `potential`, `skill_moves`, `weak_foot`) |
| `appearance` | appearance codes as the game stores them (`headtypecode`, `hairtypecode`, `skintonecode`, ...) |
| `photo` | `{image, source_path, original?}` or null |
| `face` | `{files: {game path: {kind, file}}}` (kinds: `head`, `face`, `eyes`, `hair`, `hairlod`) or null |
| `teams[]` | links to the teams of this package whose roster has the player: `team_id`, `jersey_number`, `position`, `position_name` |
| `raw` | rows with this `playerid` (every `teamplayerlinks` row of the source, too) + the `playernames` rows of its names |

### Nation

The countries picked on their own and every country referenced by the leagues, teams, players and stadiums.

| field | meaning |
|---|---|
| `name` | the `nations` row's name |
| `names` | `database`, `full`, `abbr3` (language database; missing ones left out) |
| `national_team_id`, `confederation`, `top_tier` | from the `nations` row |
| `league_ids` | every league of the country in the source (`leagues.countryid`; not only the exported ones) |
| `flag` | `{image, source_path, original?}` of the big flag (`flags512x512`) |
| `flag_files` | the other flag files of the game (`cardflags`, `countryflags`, `miniflags`), only with originals |
| `raw` | rows with this `nationid` (`nations`, `audionation` = commentary and crowd sound regions, `rowteamnationlinks`) |

### Stadium

The stadiums of the exported teams (when the export asked for them; a stadium shared by teams goes once).

| field | meaning |
|---|---|
| `names` | `database` (the `stadiums` row), `full` (language database) |
| `capacity`, `year_built`, `country_nation_id`, `home_team_id` | from the `stadiums` row (`home_team_id` null = no home team) |
| `team_ids` | every team that plays there in the source |
| `conditions[]` | `{time_of_day, rain, snow}`: the times of day the stadium offers (`1` = day, `3` = night) and, for each, whether rain and snow are allowed (both false = clear sky only). From `timeofday1..4` and `tod1weather..4` of the `stadiums` row (weather bit 1 = rain, bit 2 = snow; time `5` = unused slot, left out) |
| `pictures[]` | `{variant, image, source_path, original?}`: the menu pictures, cut to the part the screen draws |
| `files` | `{game path: zip path}` of the scene: model, textures, the variants some patches add per home team (`specificstadium_*`), crowd placement |
| `raw` | rows with this `stadiumid` (`stadiums`, `teamstadiumlinks`, `audiostadium`; not fixtures or saves) |

### Adboard

The board files picked on their own (the ones of the exported teams and leagues are in their `adboards`, when
`includes_adboards`).

| field | meaning |
|---|---|
| `name` | the file name without `.rx3` (the id of the board in the source) |
| `kind` | `game`: one of the game's own boards, `adboard_<number>_<group>.rx3` (`number`, `group`; the game picks it by competition from a table of its executable). `specific`: a file a patch's stadium script names, `specificadboard_<team>_<tournament>_<stadium>_<variant>.rx3` (`team`, `tournament`, `stadium`, `variant`; 0 = any) |
| `image`, `source_path`, `original?` | the picture decoded, where it was read and the file as the game reads it |

A board picture is 512x1024 in the game: 16 bands of 512x64, one ad per band (top to bottom). Teams' and leagues'
`adboards` are left empty when `includes_adboards` is false.

### Equipment (boots, gloves, balls)

The boots, goalkeeper gloves and balls picked on their own, plus (when `includes_equipment` is true) the boots
(`players.shoetypecode`) and goalkeeper gloves (`players.gkglovetypecode`) the exported players wear and the balls
(`teams.balltype`) of the exported teams, once each (code 0 = none, left out). Missing in packages made before them:
read as empty lists.

| field | meaning |
|---|---|
| `source_id` | the code in the source (the value of the players / teams column) |
| `name` | its name in the language database (`CreatePlayerBoot_<code>`, `GkGlovePattern_<code>`, `BallName_<code>`), null when the source has none |
| `files` | `{game path: zip path}` of every file of that code as the source has it: boot `shoe_<code>.rx3` + `shoe_<code>_<design>_textures.rx3`, glove `gkglove_<code>.rx3` + `gkglove_<code>_textures.rx3`, ball `ball_<code>.rx3` + `ball_<code>_textures.rx3` + the match settings picture `data/ui/artassets/settingsimg/ball_<code>.big` |
| `picture?` | balls: `{image, source_path, original?}` of the match settings picture, decoded |
| `raw` | boots: the `playerboots` rows of the code; balls: the `teamballs` rows; gloves: none |

## Versions

Adding optional fields keeps `format_version`. Changing or removing a field raises it.
