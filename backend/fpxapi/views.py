"""What the screens show: one summary row per country, league, team, player and stadium (built once per loaded game), the filters,
sorting and pagination of the lists (always here, never in the browser) and the detail of one item."""
import math
import unicodedata

from fpx import equipment, fifa14, stadium3d

PAGE_SIZES = (25, 50, 100)
DEFAULT_PAGE_SIZE = 50


def fold(text) -> str:
    """Lower case without accents, for searching."""
    nfd = unicodedata.normalize('NFD', str(text or '').lower())
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')


def age(birthdate: str | None, today: str = '2013-07-01') -> int | None:
    """Age on the game's reference day (the season the database describes)."""
    if not birthdate:
        return None
    by, bm, bd = (int(x) for x in birthdate.split('-'))
    ty, tm, td = (int(x) for x in today.split('-'))
    return ty - by - ((tm, td) < (bm, bd))


class Index:
    def __init__(self, src: fifa14.Fifa14Source):
        self.src = src
        self.nation_players: dict[int, int] = {}
        for p in src.players.values():
            self.nation_players[p.get('nationality')] = self.nation_players.get(p.get('nationality'), 0) + 1
        self.nations = {nid: self._nation(nid) for nid in src.nations}
        self.leagues = {lid: self._league(lid) for lid in src.leagues}
        self.teams = {tid: self._team(tid) for tid in src.teams}
        self.players = {pid: self._player(pid) for pid in src.players}
        self.stadiums = {sid: self._stadium_row(sid) for sid in src.stadiums}
        self.adboards = {name: self._adboard_row(b) for name, b in src.all_adboards.items()}
        # boots, gloves, balls: {code: row}
        self.equipment = {EQUIPMENT_LISTS[k]: {c: self._equipment_row(i) for c, i in equipment.items(src, k).items()}
                          for k in equipment.KINDS}
        self._search = {
            'nations': {i: fold(' '.join([str(i), *self.src.nation_all_names(i).values()])) for i in self.nations},
            'leagues': {i: fold(' '.join([str(i), *self.src.league_all_names(i).values()])) for i in self.leagues},
            'teams': {i: fold(' '.join([str(i), *self.src.team_all_names(i).values()])) for i in self.teams},
            'players': {i: fold(' '.join([str(i), *self.src.player_names(i).values()])) for i in self.players},
            'stadiums': {i: fold(' '.join([str(i), *self.src.stadium_all_names(i).values(),
                                           *(self.src.stadium_custom_names.get(t, '') for t in
                                             self.src.stadium_teams.get(i, []))])) for i in self.stadiums},
            'adboards': {i: fold(' '.join(str(v) for v in r.values() if v is not None)) for i, r in self.adboards.items()},
            **{kind: {c: fold(f"{c} {r['name'] or ''}") for c, r in rows.items()} for kind, rows in self.equipment.items()},
        }

    # ---- summaries ----------------------------------------------------------------------------------------------

    def _nation(self, nid: int) -> dict:
        row = self.src.nations[nid]
        names = self.src.nation_all_names(nid)
        team = row.get('teamid')
        return {
            'id': nid,
            'name': self.src.nation_name(nid) or f'#{nid}',
            'database_name': row.get('nationname'),
            'abbr3': names.get('abbr3'),
            'confederation': row.get('confederation'),
            'top_tier': row.get('top_tier'),
            'league_count': len(self.src.nation_leagues.get(nid, [])),
            'player_count': self.nation_players.get(nid, 0),
            'national_team_id': team if isinstance(team, int) and team > 0 else None,
            'has_flag': self.src.flag_path(nid) is not None,
        }

    def _stadium_row(self, sid: int) -> dict:
        row = self.src.stadiums[sid]
        home = row.get('hometeamid')
        home = home if isinstance(home, int) and home > 0 and home in self.src.teams else None
        pictures = self.src.stadium_pictures(sid, 'large') or self.src.stadium_pictures(sid, 'small')
        return {
            'id': sid,
            'name': self.src.stadium_display_name(sid),
            'language_name': self.src.stadium_names.get(sid, {}).get('full'),
            'capacity': row.get('capacity'),
            'country_id': row.get('countrycode'),
            'country': self.src.nation_name(row.get('countrycode')),
            'home_team_id': home,
            'home_team': self.src.team_display_name(home) if home else None,
            'team_count': len(self.src.stadium_teams.get(sid, [])),
            'picture': next(iter(pictures), None),  # the first picture variant, for the lists
            'has_3d': bool(self.src.stadium_files(sid)),
        }

    def stadium(self, sid: int) -> dict | None:
        """Summary of one stadium (shown on the team screen)."""
        row = self.src.stadiums.get(sid)
        if row is None:
            return None
        home = row.get('hometeamid')
        home = home if isinstance(home, int) and home > 0 else None
        files = self.src.stadium_files(sid)
        return {
            'id': sid,
            'name': self.src.stadium_display_name(sid),
            'names': self.src.stadium_all_names(sid),
            'capacity': row.get('capacity'),
            'year_built': row.get('yearbuilt'),
            'country_id': row.get('countrycode'),
            'country': self.src.nation_name(row.get('countrycode')),
            'home_team': {'id': home, 'name': self.src.team_display_name(home)} if home in self.src.teams else None,
            'team_count': len(self.src.stadium_teams.get(sid, [])),
            'conditions': self.src.stadium_conditions(sid),
            'pictures': list(self.src.stadium_pictures(sid, 'large') or self.src.stadium_pictures(sid, 'small')),
            'files': [{'path': p, 'where': self.src.files.where(p)} for p in files],
            'times': stadium3d.available(self.src.files, sid),  # 3D preview: 1 = day, 3 = night
            'raw': dict(row),
        }

    def _league(self, lid: int) -> dict:
        row = self.src.leagues[lid]
        country = row.get('countryid')
        return {
            'id': lid,
            'name': self.src.league_display_name(lid),
            'database_name': row.get('leaguename'),
            'level': row.get('level'),
            'country_id': country,
            'country': self.src.nation_name(country),
            'team_count': len(self.src.league_teams.get(lid, [])),
            'has_logo': 'logo' in self.src.league_image_paths(lid),
        }

    def _team(self, tid: int) -> dict:
        row = self.src.teams[tid]
        names = self.src.team_all_names(tid)
        leagues = self.src.team_leagues.get(tid, [])
        return {
            'id': tid,
            'name': self.src.team_display_name(tid),
            'abbr3': names.get('abbr3'),
            'league_ids': leagues,
            'league': self.src.league_display_name(leagues[0]) if leagues else None,
            'overall': row.get('overallrating'),
            'player_count': len(self.src.team_links.get(tid, [])),
            'has_crest': self.src.crest_path(tid) is not None,
            'kit_count': len(self.src.kit_paths(tid)),
            'national_team_of': self.src.national_teams.get(tid),
            # the team's three colors (teamcolor1..3) that the database has, as [r, g, b]
            'colors': [c for c in ([row.get(f'teamcolor{n}{x}') for x in 'rgb'] for n in (1, 2, 3)) if None not in c],
        }

    def _player(self, pid: int) -> dict:
        row = self.src.players[pid]
        links = self.src.player_links.get(pid, [])
        clubs = [ln['teamid'] for ln in links if ln['teamid'] not in self.src.national_teams]
        birthdate = row.get('birthdate')
        date = fifa14.to_date(birthdate)
        suspect = birthdate in self.src.suspect_birthdates
        return {
            'id': pid,
            'name': self.src.player_display_name(pid),
            'overall': row.get('overallrating'),
            'potential': row.get('potential'),
            'position': fifa14.position_name(row.get('preferredposition1')),
            'position_code': row.get('preferredposition1'),
            'nationality_id': row.get('nationality'),
            'nationality': self.src.nation_name(row.get('nationality')),
            'birthdate': date,
            'birthdate_suspect': suspect,
            'age': None if suspect else age(date),
            'height': row.get('height'),
            'team_id': clubs[0] if clubs else None,
            'team': self.src.team_display_name(clubs[0]) if clubs else None,
            'team_ids': [ln['teamid'] for ln in links],
            'has_face': self.src.has_face(pid),
            'has_photo': self.src.photo_path(pid) is not None,
        }

    def _adboard_row(self, b: dict) -> dict:
        """A board file of the list: a board of the game (its number) or one a patch's script names (team,
        tournament, stadium, variant; 0 = any). The tournament is named when a league has that id."""
        if b['kind'] == 'game':
            return {'id': b['name'], 'kind': 'game', 'number': b['number'], 'group': b['group'], 'team_id': None,
                    'team': None, 'tournament': None, 'league': None, 'stadium': None, 'variant': None}
        team, tournament = b['team'] or None, b['tournament'] or None
        return {'id': b['name'], 'kind': 'specific', 'number': None, 'group': None, 'team_id': team,
                'team': self.src.team_display_name(team) if team in self.src.teams else None,
                'tournament': tournament,
                'league': self.src.league_display_name(tournament) if tournament in self.src.leagues else None,
                'stadium': b['stadium'] or None, 'variant': b['variant']}

    @staticmethod
    def _equipment_row(item: dict) -> dict:
        """A boot, glove or ball of the list: its code, name (None = the game has none), how many players or teams use
        it, whether its list table has it (gloves: None, they have none) and how many files it has."""
        return {'id': item['code'], 'name': item['name'], 'wearers': item['wearers'], 'listed': item['listed'],
                'files': len(item['files'])}

    # ---- lists --------------------------------------------------------------------------------------------------

    def search(self, kind: str, ids, q: str):
        needle = fold(q).strip()
        if not needle:
            return ids
        words = needle.split()
        texts = self._search[kind]
        return [i for i in ids if all(w in texts[i] for w in words)]


EQUIPMENT_LISTS = {'boot': 'boots', 'glove': 'gloves', 'ball': 'balls'}
EQUIPMENT_KIND = {v: k for k, v in EQUIPMENT_LISTS.items()}

SORTS = {
    **{kind: {'name', 'id', 'wearers'} for kind in EQUIPMENT_KIND},
    'adboards': {'id', 'kind', 'team', 'league', 'tournament'},
    'stadiums': {'name', 'id', 'capacity', 'country', 'team_count'},
    'nations': {'name', 'id', 'confederation', 'league_count', 'player_count'},
    'leagues': {'name', 'id', 'level', 'country', 'team_count'},
    'teams': {'name', 'id', 'overall', 'league', 'player_count', 'kit_count'},
    'players': {'name', 'id', 'overall', 'potential', 'age', 'birthdate', 'position_code', 'nationality', 'team',
                'height'},
}
DEFAULT_SORT = {**{kind: ('id', 'asc') for kind in EQUIPMENT_KIND},
                'adboards': ('id', 'asc'), 'stadiums': ('name', 'asc'), 'nations': ('name', 'asc'), 'leagues': ('name', 'asc'), 'teams': ('name', 'asc'), 'players': ('overall', 'desc')}


def page(rows: list[dict], kind: str, sort: str | None, direction: str | None, page_no: int, size: int) -> dict:
    """Sorted page of `rows` (summaries). Missing values always go last."""
    key, default_dir = DEFAULT_SORT[kind]
    if sort in SORTS[kind]:
        key = sort
        default_dir = 'asc' if key in ('name', 'country', 'league', 'nationality', 'team', 'position_code',
                                       'birthdate') or kind == 'adboards' or \
            (kind in EQUIPMENT_KIND and key != 'wearers') else 'desc'
    desc = (direction or default_dir) == 'desc'
    present = [r for r in rows if r.get(key) is not None]
    missing = [r for r in rows if r.get(key) is None]

    def sort_key(r):
        v = r[key]
        return (fold(v) if isinstance(v, str) else v, r['id'])
    present.sort(key=sort_key, reverse=desc)
    rows = present + missing
    size = size if size in PAGE_SIZES else DEFAULT_PAGE_SIZE
    pages = max(1, math.ceil(len(rows) / size))
    page_no = min(max(1, page_no), pages)
    return {'items': rows[(page_no - 1) * size:page_no * size], 'total': len(rows), 'page': page_no, 'size': size,
            'pages': pages, 'sort': key, 'dir': 'desc' if desc else 'asc'}
