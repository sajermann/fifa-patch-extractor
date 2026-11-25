"""The selection tree of the basket: what is inside each item, the state of its checkbox and what a click does.

Node keys (ids of the loaded game):
  nation:<id>          its leagues
  league:<id>          its board files (part) and its teams
  team:<id>            its stadium, ball and board files (parts) and its roster
  player:<team>:<id>   a player of a team's roster (team 0 = a player that goes without a team); its boot and glove
  stadium:<team> ball:<team> adboards:<team>   parts of a team
  leagueboards:<id>    the board files of a league
  boot:<team>:<player> glove:<team>:<player>   parts of a player
  onestadium:<id> adboard:<file name> gear:<boots|gloves|balls>:<code>   items picked on their own
  group:<players|stadiums|adboards|boots|gloves|balls>   the items that go on their own, together
  root                 everything in the basket

A part is left out by naming it in the basket's `off`: {"team:<id>": ["stadium", "ball", "adboards"],
"league:<id>": ["adboards"], "player:<id>": ["boot", "glove"]}; anything not named there goes with its owner.

States: full = the item and everything inside; only = the item without anything inside; part = some of it;
none = nothing of it.
"""
from fpx import fifa14

TEAM_PARTS = ('stadium', 'ball', 'adboards')
PLAYER_PARTS = ('boot', 'glove')
GEAR_COLUMN = {'boot': 'shoetypecode', 'glove': 'gkglovetypecode'}
GROUPS = ('players', 'stadiums', 'adboards', 'boots', 'gloves', 'balls')
MODES = ('all', 'none', 'only')


def parse(key: str) -> tuple[str, list]:
    """(kind, ids) of a node key; raises ValueError on a malformed one."""
    if not isinstance(key, str) or not key:
        raise ValueError('key')
    kind, _, rest = key.partition(':')
    if kind == 'root' and not rest:
        return kind, []
    if kind == 'adboard' and rest:
        return kind, [rest]
    if kind == 'group' and rest in GROUPS:
        return kind, [rest]
    if kind == 'gear':
        lst, _, code = rest.partition(':')
        if lst in ('boots', 'gloves', 'balls') and code.isdigit():
            return kind, [lst, int(code)]
        raise ValueError(key)
    parts = rest.split(':')
    size = {'nation': 1, 'league': 1, 'team': 1, 'stadium': 1, 'ball': 1, 'adboards': 1, 'leagueboards': 1,
            'onestadium': 1, 'player': 2, 'boot': 2, 'glove': 2}.get(kind)
    if size is None or len(parts) != size or not all(p.isdigit() for p in parts):
        raise ValueError(key)
    return kind, [int(p) for p in parts]


# ---- reading --------------------------------------------------------------------------------------------------------

class Tree:
    """The tree of one basket over the loaded game (built per request: states are remembered while it lives)."""

    def __init__(self, data: dict, src: fifa14.Fifa14Source):
        self.d = data
        self.src = src
        self._states: dict[str, str] = {}
        self._wearers: dict[tuple[str, int], set[int]] | None = None

    # -- the basket
    def off(self, owner: str) -> list[str]:
        return self.d.get('off', {}).get(owner, [])

    def team(self, tid: int) -> dict | None:
        return self.d['teams'].get(str(tid))

    def has_player(self, tid: int, pid: int) -> bool:
        if tid == 0:
            return pid in self.d['players']
        team = self.team(tid)
        return bool(team) and pid in team['players']

    # -- the game
    def gear_code(self, kind: str, pid: int) -> int | None:
        code = (self.src.players.get(pid) or {}).get(GEAR_COLUMN[kind])
        return code if isinstance(code, int) and code > 0 else None

    def ball_code(self, tid: int) -> int | None:
        code = (self.src.teams.get(tid) or {}).get('balltype')
        return code if isinstance(code, int) and code > 0 else None

    def roster(self, tid: int) -> list[int]:
        return [ln['playerid'] for ln in self.src.team_links.get(tid, [])]

    def team_parts(self, tid: int) -> list[str]:
        out = []
        if self.src.team_stadiums.get(tid):
            out.append('stadium')
        if self.ball_code(tid):
            out.append('ball')
        if self.src.team_adboards(tid):
            out.append('adboards')
        return out

    def children(self, key: str) -> list[str]:
        kind, ids = parse(key)
        if kind == 'nation':
            return [f'league:{lid}' for lid in self.src.nation_leagues.get(ids[0], []) if lid in self.src.leagues]
        if kind == 'league':
            lid = ids[0]
            boards = [f'leagueboards:{lid}'] if self.src.league_adboards(lid) else []
            return boards + [f'team:{tid}' for tid in self.src.league_teams.get(lid, []) if tid in self.src.teams]
        if kind == 'team':
            tid = ids[0]
            return [f'{p}:{tid}' for p in self.team_parts(tid)] + [f'player:{tid}:{pid}' for pid in self.roster(tid)]
        if kind == 'player':
            tid, pid = ids
            return [f'{k}:{tid}:{pid}' for k in PLAYER_PARTS if self.gear_code(k, pid)]
        if kind == 'group':
            name = ids[0]
            if name == 'players':
                return [f'player:0:{pid}' for pid in self.d['players']]
            if name == 'stadiums':
                return [f'onestadium:{sid}' for sid in self.d['stadiums']]
            if name == 'adboards':
                return [f'adboard:{n}' for n in self.d['adboards']]
            return [f'gear:{name}:{c}' for c in self.d[name]]
        if kind == 'root':
            return self.root()
        return []

    def root(self) -> list[str]:
        """The top items of the basket: the countries that have something picked, the leagues of no country and the
        teams of no league that are picked, then the groups of the items picked on their own."""
        out = [f'nation:{nid}' for nid in self.src.nations if self.state(f'nation:{nid}') != 'none']
        in_nation = {lid for lids in self.src.nation_leagues.values() for lid in lids}
        out += [f'league:{lid}' for lid in self.src.leagues
                if lid not in in_nation and self.state(f'league:{lid}') != 'none']
        in_league = {tid for tids in self.src.league_teams.values() for tid in tids}
        out += [f'team:{k}' for k in self.d['teams'] if int(k) not in in_league]
        out += [f'group:{g}' for g in GROUPS if self.d[g]]
        return out

    def self_on(self, key: str) -> bool | None:
        """Whether the item itself goes (None: a group, made only of what is inside)."""
        kind, ids = parse(key)
        if kind == 'nation':
            return ids[0] in self.d['nations']
        if kind == 'league':
            return ids[0] in self.d['leagues']
        if kind == 'team':
            return self.team(ids[0]) is not None
        if kind == 'player':
            return self.has_player(*ids)
        if kind in TEAM_PARTS:
            return self.team(ids[0]) is not None and kind not in self.off(f'team:{ids[0]}')
        if kind == 'leagueboards':
            return ids[0] in self.d['leagues'] and 'adboards' not in self.off(f'league:{ids[0]}')
        if kind in PLAYER_PARTS:
            return self.has_player(*ids) and kind not in self.off(f'player:{ids[1]}')
        if kind == 'onestadium':
            return ids[0] in self.d['stadiums']
        if kind == 'adboard':
            return ids[0] in self.d['adboards']
        if kind == 'gear':
            return ids[1] in self.d[ids[0]]
        return None

    def state(self, key: str) -> str:
        if key in self._states:
            return self._states[key]
        kind, ids = parse(key)
        own = self.self_on(key)
        if own is False and kind in ('team', 'player'):  # nothing inside goes without its owner
            out = 'none'
        elif own is False and kind == 'league' and not any(
                str(t) in self.d['teams'] for t in self.src.league_teams.get(ids[0], [])):
            out = 'none'
        else:
            states = [self.state(k) for k in self.children(key)]
            if not states:
                out = 'full' if own else 'none'
            elif own is None:
                out = 'full' if all(s == 'full' for s in states) else \
                    'part' if any(s != 'none' for s in states) else 'none'
            elif own:
                out = 'full' if all(s == 'full' for s in states) else \
                    'only' if all(s == 'none' for s in states) else 'part'
            else:
                out = 'part' if any(s != 'none' for s in states) else 'none'
        self._states[key] = out
        return out

    def inside(self, key: str) -> dict[str, int]:
        """How many leagues, teams and players go inside the item (for the "added with ..." notice)."""
        out = {'leagues': 0, 'teams': 0, 'players': 0}
        names = {'league': 'leagues', 'team': 'teams', 'player': 'players'}

        def walk(k):
            for child in self.children(k):
                if self.state(child) == 'none':
                    continue
                kind = parse(child)[0]
                if kind in names and self.self_on(child):
                    out[names[kind]] += 1
                if kind in ('nation', 'league', 'team', 'group'):
                    walk(child)
        walk(key)
        return out

    def wearers(self, kind: str, code: int) -> set[int]:
        """The players of the basket whose boot (or glove) of that code goes."""
        if self._wearers is None:
            self._wearers = {}
            contexts = [(0, pid) for pid in self.d['players']] + \
                [(int(t), pid) for t, v in self.d['teams'].items() for pid in v['players']]
            for tid, pid in contexts:
                for k in PLAYER_PARTS:
                    c = self.gear_code(k, pid)
                    if c and k not in self.off(f'player:{pid}'):
                        self._wearers.setdefault((k, c), set()).add(pid)
        return self._wearers.get((kind, code), set())


# ---- changing -----------------------------------------------------------------------------------------------------

def _set_off(d: dict, owner: str, parts, off: bool) -> None:
    current = d.setdefault('off', {}).get(owner, [])
    now = list(dict.fromkeys(current + list(parts))) if off else [p for p in current if p not in parts]
    if now:
        d['off'][owner] = now
    else:
        d['off'].pop(owner, None)


def _in_basket(d: dict, pid: int) -> bool:
    return pid in d['players'] or any(pid in v['players'] for v in d['teams'].values())


def _ensure_team(d: dict, tid: int) -> None:
    """A team that comes in because something inside it was picked: alone, with none of its parts."""
    if str(tid) not in d['teams']:
        d['teams'][str(tid)] = {'players': [], 'crest_no_background': False}
        _set_off(d, f'team:{tid}', TEAM_PARTS, True)


def _ensure_player(d: dict, tid: int, pid: int) -> None:
    """A player that comes in because its boot or glove was picked (or itself): a player new to the basket comes
    without its parts."""
    new = not _in_basket(d, pid)
    if tid == 0:
        if pid not in d['players']:
            d['players'].append(pid)
    else:
        _ensure_team(d, tid)
        roster = d['teams'][str(tid)]['players']
        if pid not in roster:
            roster.append(pid)
    if new:
        _set_off(d, f'player:{pid}', PLAYER_PARTS, True)


def set_node(d: dict, src: fifa14.Fifa14Source, key: str, mode: str) -> None:
    """mode: all = the item and everything inside; none = nothing of it; only = the item without anything inside."""
    if mode not in MODES:
        raise ValueError('mode')
    kind, ids = parse(key)
    tree = Tree(d, src)
    if kind in ('nation', 'league'):
        i = ids[0]
        lst = d['nations' if kind == 'nation' else 'leagues']
        if mode == 'none':
            d[kind + 's'] = [x for x in lst if x != i]
        elif i not in lst:
            lst.append(i)
        if kind == 'league':
            _set_off(d, f'league:{i}', ('adboards',), mode == 'only')
            if mode == 'none':
                d['off'].pop(f'league:{i}', None)
        for child in tree.children(key):
            if parse(child)[0] != 'leagueboards':
                set_node(d, src, child, 'all' if mode == 'all' else 'none')
        return
    if kind == 'team':
        tid = ids[0]
        if mode == 'none':
            d['teams'].pop(str(tid), None)
            d.setdefault('off', {}).pop(f'team:{tid}', None)
            return
        crest = (d['teams'].get(str(tid)) or {}).get('crest_no_background', False)
        roster = tree.roster(tid) if mode == 'all' else []
        d['teams'][str(tid)] = {'players': roster, 'crest_no_background': crest}
        _set_off(d, f'team:{tid}', TEAM_PARTS, mode == 'only')
        for pid in roster:
            _set_off(d, f'player:{pid}', PLAYER_PARTS, False)
        return
    if kind == 'player':
        tid, pid = ids
        if mode == 'none':
            if tid == 0:
                d['players'] = [p for p in d['players'] if p != pid]
            elif str(tid) in d['teams']:
                d['teams'][str(tid)]['players'] = [p for p in d['teams'][str(tid)]['players'] if p != pid]
            if not _in_basket(d, pid):
                d.setdefault('off', {}).pop(f'player:{pid}', None)
            return
        if tid == 0 and pid not in d['players']:  # a player picked from a list: where a team of the basket has it
            tid = next((int(k) for k, v in d['teams'].items() if pid in v['players']), 0)
        _ensure_player(d, tid, pid)
        _set_off(d, f'player:{pid}', PLAYER_PARTS, mode == 'only')
        return
    if kind in TEAM_PARTS:
        tid = ids[0]
        if mode != 'none':
            _ensure_team(d, tid)
        if str(tid) in d['teams']:
            _set_off(d, f'team:{tid}', (kind,), mode == 'none')
        return
    if kind == 'leagueboards':
        lid = ids[0]
        if mode != 'none' and lid not in d['leagues']:
            d['leagues'].append(lid)
        _set_off(d, f'league:{lid}', ('adboards',), mode == 'none')
        return
    if kind in PLAYER_PARTS:
        tid, pid = ids
        if mode != 'none':
            _ensure_player(d, tid, pid)
        if _in_basket(d, pid):
            _set_off(d, f'player:{pid}', (kind,), mode == 'none')
        return
    if kind in ('onestadium', 'adboard', 'gear'):
        lst_name, item = {'onestadium': ('stadiums', ids[0]), 'adboard': ('adboards', ids[0])}.get(kind) or (ids[0], ids[1])
        lst = d[lst_name]
        if mode == 'none':
            d[lst_name] = [x for x in lst if x != item]
        elif item not in lst:
            lst.append(item)
        return
    if kind in ('group', 'root') and mode == 'none':
        for child in tree.children(key):
            set_node(d, src, child, 'none')


def package_counts(d: dict, src: fifa14.Fifa14Source, idx) -> dict[str, int]:
    """How many stadiums, board files, boots, gloves and balls the package takes (the same rules as the package:
    the ones picked on their own plus the parts of the teams, leagues and players that are not left out; a boot,
    glove or ball counts only when the game has its files)."""
    off = d.get('off', {})
    stadiums = set(d['stadiums'])
    boards = set(d['adboards'])
    gear = {lst: set(d[lst]) for lst in ('boots', 'gloves', 'balls')}
    players = set(d['players'])
    for k, team in d['teams'].items():
        tid = int(k)
        players.update(team['players'])
        parts_off = off.get(f'team:{tid}', [])
        if 'stadium' not in parts_off:
            stadiums.update(src.team_stadiums.get(tid, []))
        if 'adboards' not in parts_off:
            boards.update(b['path'] for b in src.team_adboards(tid))
        ball = (src.teams.get(tid) or {}).get('balltype')
        if 'ball' not in parts_off and isinstance(ball, int) and ball > 0:
            gear['balls'].add(ball)
    for lid in d['leagues']:
        if 'adboards' not in off.get(f'league:{lid}', []):
            boards.update(b['path'] for b in src.league_adboards(lid))
    for pid in players:
        row = src.players.get(pid) or {}
        for kind, lst in (('boot', 'boots'), ('glove', 'gloves')):
            code = row.get(GEAR_COLUMN[kind])
            if isinstance(code, int) and code > 0 and kind not in off.get(f'player:{pid}', []):
                gear[lst].add(code)
    # the boards picked on their own are file names, the others paths: count each file once
    names = {b if '/' not in b else b.rsplit('/', 1)[-1].rsplit('.', 1)[0] for b in boards}
    return {'stadiums': len(stadiums), 'adboards': len(names),
            **{lst: len({c for c in codes if c in idx.equipment[lst]}) for lst, codes in gear.items()}}


# ---- what the screens show ----------------------------------------------------------------------------------------

def node_view(tree: Tree, idx, key: str, with_inside: bool = False) -> dict:
    """One row of the tree: {key, kind, id, name, detail, code, state, count: {on, total} | None, shared}."""
    kind, ids = parse(key)
    src = tree.src
    kids = tree.children(key)
    out = {'key': key, 'kind': kind, 'id': ids[-1] if ids else None, 'name': None, 'detail': None, 'code': None,
           'state': tree.state(key), 'count': None, 'shared': 0}
    if kids:
        out['count'] = {'on': sum(tree.state(k) != 'none' for k in kids), 'total': len(kids)}

    def name(table, i):
        return table[i]['name'] if i in table else f'#{i}'
    if kind == 'nation':
        out['name'] = name(idx.nations, ids[0])
    elif kind == 'league':
        out['name'] = name(idx.leagues, ids[0])
        out['detail'] = idx.leagues[ids[0]]['country'] if ids[0] in idx.leagues else None
    elif kind == 'team':
        out['name'] = name(idx.teams, ids[0])
    elif kind == 'player':
        out['name'] = name(idx.players, ids[1])
        row = idx.players.get(ids[1])
        out['detail'] = row['position'] if row else None
    elif kind == 'stadium':
        out['name'] = ', '.join(src.stadium_display_name(s) or f'#{s}' for s in src.team_stadiums.get(ids[0], []))
    elif kind == 'onestadium':
        out['name'] = name(idx.stadiums, ids[0])
    elif kind == 'ball':
        code = tree.ball_code(ids[0])
        out['code'] = code
        out['name'] = (idx.equipment['balls'].get(code) or {}).get('name')
    elif kind == 'adboards':
        out['count_files'] = len(src.team_adboards(ids[0]))
    elif kind == 'leagueboards':
        out['count_files'] = len(src.league_adboards(ids[0]))
    elif kind in PLAYER_PARTS:
        code = tree.gear_code(kind, ids[1])
        out['code'] = code
        out['name'] = (idx.equipment[kind + 's'].get(code) or {}).get('name')
        out['shared'] = len(tree.wearers(kind, code) - {ids[1]})  # other players of the basket that take it
    elif kind == 'gear':
        out['code'] = ids[1]
        out['name'] = (idx.equipment[ids[0]].get(ids[1]) or {}).get('name')
    elif kind == 'adboard':
        out['name'] = ids[0]
    elif kind == 'group':
        out['name'] = ids[0]
    if with_inside:
        out['inside'] = tree.inside(key)
    return out
