"""HTTP API of the extractor (FastAPI). The interface is served from the same address (frontend/dist)."""
import datetime
import hashlib
import logging
import os
import re
from collections import OrderedDict
from contextlib import asynccontextmanager
from threading import Lock, get_ident
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import settings  # noqa: I001 - first: it puts the core folder on the path

from fpx import (equipment, fifa14, images, kitfonts, kitprint, package, preview, rx3, stadium3d,  # noqa: E402
                 workers)

from . import dialogs, tree, views  # noqa: E402
from .state import Basket, Exports, Selections, SourceHolder

log = logging.getLogger('fpxapi')

source = SourceHolder()
basket = Basket(os.path.join(settings.DATA_DIR, 'basket.json'))
selections = Selections(os.path.join(settings.DATA_DIR, 'selections'))
exports = Exports()


class ApiError(HTTPException):
    """An error the interface translates: `code` names the message, `detail` adds context."""

    def __init__(self, status: int, code: str, detail: str = ''):
        super().__init__(status_code=status, detail={'code': code, 'detail': detail})


def ready():
    if source.state != 'ready' or source.src is None or source.index is None:
        raise ApiError(409, 'no_source')
    return source.src, source.index


# ---- status and settings ------------------------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    cfg = settings.load()  # the game loaded last opens again by itself
    if cfg.source_dir and os.path.isdir(cfg.source_dir):
        source.load(cfg.source_dir, cfg.game_language)
    yield


app = FastAPI(title='FIFA Patch Extractor', version=settings.APP_VERSION, lifespan=lifespan)


@app.get('/api/status')
def get_status():
    cfg = settings.load()
    return {'version': settings.APP_VERSION, 'source': source.status(), 'config': cfg.model_dump(),
            'exports_dir': cfg.exports_dir(), 'basket': basket_counts()}


class SettingsBody(BaseModel):
    language: Optional[settings.Language] = None
    game_language: Optional[str] = None
    output_dir: Optional[str] = None
    export_cores: Optional[int] = None  # null = the default
    export_memory_percent: Optional[int] = None


@app.get('/api/machine')
def machine():
    """What an export may use on this machine (fpx.workers.describe): cores and memory the system reports (None
    when it does not tell), the defaults and the threads the saved settings give."""
    cfg = settings.load()
    return workers.describe(cfg.export_cores, cfg.export_memory_percent)


@app.put('/api/settings')
def put_settings(body: SettingsBody):
    cfg = settings.load()
    fields = body.model_dump(exclude_unset=True)
    if 'output_dir' in fields and fields['output_dir'] and not os.path.isdir(fields['output_dir']):
        raise ApiError(400, 'folder_not_found', fields['output_dir'])
    reload = 'game_language' in fields and fields['game_language'] != cfg.game_language
    cfg = settings.save(settings.Config.model_validate({**cfg.model_dump(), **fields}))  # validated: the ranges
    if reload and cfg.source_dir and source.state != 'loading':
        source.load(cfg.source_dir, cfg.game_language)
    return cfg.model_dump()


@app.post('/api/dialog/folder')
def pick_folder(body: dict):
    try:
        return {'path': dialogs.browse_folder(body.get('initial'), body.get('title') or 'Choose a folder')}
    except dialogs.DialogError as e:
        raise ApiError(500, 'dialog_failed', str(e))


class SourceBody(BaseModel):
    path: str


@app.post('/api/source')
def load_source(body: SourceBody):
    path = body.path.strip().strip('"')
    if not os.path.isdir(path):
        raise ApiError(400, 'folder_not_found', path)
    cfg = settings.remember_source(settings.load(), path)
    try:
        source.load(path, cfg.game_language)
    except RuntimeError:
        raise ApiError(409, 'busy')
    return source.status()


@app.delete('/api/source/recent')
def forget_recent(path: str):
    cfg = settings.load()
    cfg.recent_sources = [p for p in cfg.recent_sources if p != path]
    return settings.save(cfg).model_dump()


# ---- lists --------------------------------------------------------------------------------------------------------

def basket_counts() -> dict:
    """How many of each go in the package: stadiums, board files, boots, gloves and balls count the ones picked on
    their own and the ones that go with the teams, leagues and players of the basket (each once)."""
    d = basket.data
    out = {'nations': len(d['nations']), 'leagues': len(d['leagues']), 'teams': len(d['teams']),
           'players': len(basket.player_ids()), 'stadiums': len(d['stadiums']), 'adboards': len(d['adboards']),
           **{kind: len(d[kind]) for kind in views.EQUIPMENT_KIND}}
    if source.state == 'ready' and source.src is not None and source.index is not None:
        out.update(tree.package_counts(d, source.src, source.index))
    return out


ON_THEIR_OWN = ('nations', 'stadiums', 'adboards', *views.EQUIPMENT_KIND)  # basket lists of ids picked alone


def _row_key(kind: str, row_id) -> str:
    """The selection tree's node of a list row (a player: where the basket has it, a team of it or on its own)."""
    if kind == 'players':
        d = basket.data
        if row_id not in d['players']:
            team = next((k for k, v in d['teams'].items() if row_id in v['players']), None)
            if team is not None:
                return f'player:{team}:{row_id}'
        return f'player:0:{row_id}'
    if kind in views.EQUIPMENT_KIND:
        return f'gear:{kind}:{row_id}'
    return {'nations': 'nation', 'leagues': 'league', 'teams': 'team', 'stadiums': 'onestadium',
            'adboards': 'adboard'}[kind] + f':{row_id}'


VIA_SHOWN = 3  # owner names a list row shows (the rest only counted)


def _owned(kind: str) -> dict:
    """The items of a list of things picked on their own that go as a part of a team, league or player instead
    ({id: [owner key]}; empty for the other lists or with no game loaded)."""
    if kind not in tree.OWNED_LISTS or source.state != 'ready' or source.src is None:
        return {}
    return tree.with_owners(basket.data, source.src)[kind]


def _via(owners: list[str]) -> dict | None:
    """{names, total} of the owners a row goes with (the first few names), or None."""
    if not owners or source.index is None:
        return None
    idx = source.index
    tables = {'team': idx.teams, 'league': idx.leagues, 'player': idx.players}
    names = []
    for key in owners[:VIA_SHOWN]:
        kind, _, oid = key.partition(':')  # owner keys of tree.with_owners: <team|league|player>:<id>
        row = tables[kind].get(int(oid))
        names.append(row['name'] if row and row.get('name') else f'#{oid}')
    return {'names': names, 'total': len(owners)}


def _with_basket(kind: str, rows: list[dict]) -> list[dict]:
    """The rows with in_basket (the item itself goes) and their node in the selection tree: basket_key,
    basket_state (full | only | part | none) and basket_count ({on, total} of what is right inside, or None).
    The lists of things picked on their own also say basket_via: {names, total} of the teams, leagues or players
    it goes with (it goes even when not picked on its own), or None."""
    if kind in ON_THEIR_OWN:
        inside = set(basket.data[kind])
    elif kind == 'leagues':
        inside = set(basket.data['leagues'])
    elif kind == 'teams':
        inside = {int(k) for k in basket.data['teams']}
    else:
        inside = basket.player_ids()
    src = source.src if source.state == 'ready' else None
    t = tree.Tree(basket.data, src) if src else None
    owned = _owned(kind)
    out = []
    for r in rows:
        key = _row_key(kind, r['id'])
        row = {**r, 'in_basket': r['id'] in inside, 'basket_key': key,
               'basket_state': 'full' if r['id'] in inside else 'none', 'basket_count': None}
        if kind in tree.OWNED_LISTS:
            row['basket_via'] = _via(owned.get(r['id'], []))
        if t is not None and kind in ('nations', 'leagues', 'teams', 'players'):
            kids = t.children(key)
            row['basket_state'] = t.state(key)
            row['basket_count'] = {'on': sum(t.state(k) != 'none' for k in kids), 'total': len(kids)} if kids else None
        if kind == 'teams':
            team = basket.data['teams'].get(str(r['id']))
            row['basket_players'] = len(team['players']) if team else 0
        out.append(row)
    return out


def _ids_or_page(kind: str, rows: list[dict], ids_only: bool, sort, dir, page, size):
    """ids_only: the ids of every row that passes the filters (the header's "select all"), else one sorted page."""
    if ids_only:
        return {'ids': [r['id'] for r in rows]}
    out = views.page(rows, kind, sort, dir, page, size)
    out['items'] = _with_basket(kind, out['items'])
    return out


def _yes_no(value: Optional[str]):
    return {'yes': True, 'no': False}.get(value or '')


def _basket_filter(kind: str, rows: list[dict], value: Optional[str]):
    want = _yes_no(value)
    if want is None:
        return rows
    if kind in ON_THEIR_OWN:
        inside = set(basket.data[kind])
    elif kind == 'leagues':
        inside = set(basket.data['leagues'])
    elif kind == 'teams':
        inside = {int(k) for k in basket.data['teams']}
    else:
        inside = basket.player_ids()
    inside = set(inside) | set(_owned(kind))  # what goes with a team, league or player goes too
    return [r for r in rows if (r['id'] in inside) == want]


@app.get('/api/nations')
def list_nations(q: str = '', confederation: Optional[int] = None, leagues: Optional[str] = None,
                 in_basket: Optional[str] = None, sort: Optional[str] = None, dir: Optional[str] = None,
                 page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    _, idx = ready()
    rows = [idx.nations[i] for i in idx.search('nations', list(idx.nations), q)]
    if confederation is not None:
        rows = [r for r in rows if r['confederation'] == confederation]
    if (want := _yes_no(leagues)) is not None:
        rows = [r for r in rows if (r['league_count'] > 0) == want]
    rows = _basket_filter('nations', rows, in_basket)
    return _ids_or_page('nations', rows, ids_only, sort, dir, page, size)


@app.get('/api/stadiums')
def list_stadiums(q: str = '', country: Optional[int] = None, home: Optional[str] = None,
                  in_basket: Optional[str] = None, sort: Optional[str] = None, dir: Optional[str] = None,
                  page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    _, idx = ready()
    rows = [idx.stadiums[i] for i in idx.search('stadiums', list(idx.stadiums), q)]
    if country is not None:
        rows = [r for r in rows if r['country_id'] == country]
    if (want := _yes_no(home)) is not None:
        rows = [r for r in rows if (r['home_team_id'] is not None) == want]
    rows = _basket_filter('stadiums', rows, in_basket)
    return _ids_or_page('stadiums', rows, ids_only, sort, dir, page, size)


@app.get('/api/adboards')
def list_adboards(q: str = '', kind: Optional[str] = None, in_basket: Optional[str] = None, sort: Optional[str] = None,
                  dir: Optional[str] = None, page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    """The board files of the game: its own boards and the ones a patch's stadium script names."""
    _, idx = ready()
    rows = [idx.adboards[i] for i in idx.search('adboards', list(idx.adboards), q)]
    if kind in ('game', 'specific'):
        rows = [r for r in rows if r['kind'] == kind]
    rows = _basket_filter('adboards', rows, in_basket)
    return _ids_or_page('adboards', rows, ids_only, sort, dir, page, size)


@app.get('/api/equipment/{kind}')
def list_equipment(kind: str, q: str = '', used: Optional[str] = None, in_basket: Optional[str] = None,
                   sort: Optional[str] = None, dir: Optional[str] = None, page: int = 1,
                   size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    """The game's boots, goalkeeper gloves or balls (kind: boots | gloves | balls); used: worn by a player / a team."""
    if kind not in views.EQUIPMENT_KIND:
        raise ApiError(404, 'not_found')
    _, idx = ready()
    items = idx.equipment[kind]
    rows = [items[i] for i in idx.search(kind, list(items), q)]
    if (want := _yes_no(used)) is not None:
        rows = [r for r in rows if (r['wearers'] > 0) == want]
    rows = _basket_filter(kind, rows, in_basket)
    return _ids_or_page(kind, rows, ids_only, sort, dir, page, size)


@app.get('/api/leagues')
def list_leagues(q: str = '', country: Optional[int] = None, level: Optional[int] = None,
                 in_basket: Optional[str] = None, sort: Optional[str] = None, dir: Optional[str] = None,
                 page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    _, idx = ready()
    rows = [idx.leagues[i] for i in idx.search('leagues', list(idx.leagues), q)]
    if country is not None:
        rows = [r for r in rows if r['country_id'] == country]
    if level is not None:
        rows = [r for r in rows if r['level'] == level]
    rows = _basket_filter('leagues', rows, in_basket)
    return _ids_or_page('leagues', rows, ids_only, sort, dir, page, size)


@app.get('/api/teams')
def list_teams(q: str = '', league: Optional[int] = None, kits: Optional[str] = None, national: Optional[str] = None,
               in_basket: Optional[str] = None, sort: Optional[str] = None, dir: Optional[str] = None,
               page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    src, idx = ready()
    ids = list(idx.teams) if league is None else src.league_teams.get(league, [])
    rows = [idx.teams[i] for i in idx.search('teams', [i for i in ids if i in idx.teams], q)]
    if (want := _yes_no(kits)) is not None:
        rows = [r for r in rows if (r['kit_count'] > 0) == want]
    if (want := _yes_no(national)) is not None:
        rows = [r for r in rows if (r['national_team_of'] is not None) == want]
    rows = _basket_filter('teams', rows, in_basket)
    return _ids_or_page('teams', rows, ids_only, sort, dir, page, size)


@app.get('/api/players')
def list_players(q: str = '', team: Optional[int] = None, league: Optional[int] = None,
                 nation: Optional[int] = None, position: Optional[int] = None,
                 min_overall: Optional[int] = None, max_overall: Optional[int] = None,
                 face: Optional[str] = None, in_basket: Optional[str] = None,
                 sort: Optional[str] = None, dir: Optional[str] = None,
                 page: int = 1, size: int = views.DEFAULT_PAGE_SIZE, ids_only: bool = False):
    src, idx = ready()
    if team is not None:
        ids = [ln['playerid'] for ln in src.team_links.get(team, [])]
    elif league is not None:
        ids = list(dict.fromkeys(ln['playerid'] for t in src.league_teams.get(league, [])
                                 for ln in src.team_links.get(t, [])))
    else:
        ids = list(idx.players)
    rows = [idx.players[i] for i in idx.search('players', [i for i in ids if i in idx.players], q)]
    if nation is not None:
        rows = [r for r in rows if r['nationality_id'] == nation]
    if position is not None:
        rows = [r for r in rows if r['position_code'] == position]
    if min_overall is not None:
        rows = [r for r in rows if (r['overall'] or 0) >= min_overall]
    if max_overall is not None:
        rows = [r for r in rows if (r['overall'] or 0) <= max_overall]
    if (want := _yes_no(face)) is not None:
        rows = [r for r in rows if r['has_face'] == want]
    rows = _basket_filter('players', rows, in_basket)
    return _ids_or_page('players', rows, ids_only, sort, dir, page, size)


@app.get('/api/options')
def filter_options():
    """Small lists for the filter selects: leagues, nations (with players) and positions."""
    src, idx = ready()
    used_nations = ({r['nationality_id'] for r in idx.players.values()} | {r['country_id'] for r in idx.leagues.values()}
                    | {r['country_id'] for r in idx.stadiums.values()})
    return {
        'leagues': sorted(({'id': r['id'], 'name': r['name']} for r in idx.leagues.values()),
                          key=lambda r: views.fold(r['name'])),
        'nations': sorted(({'id': nid, 'name': idx.nations[nid]['name']} for nid in src.nations
                           if nid in used_nations), key=lambda r: views.fold(r['name'])),
        'confederations': sorted({r['confederation'] for r in idx.nations.values() if r['confederation'] is not None}),
        'positions': [{'id': i, 'name': n} for i, n in enumerate(fifa14.POSITIONS[:28])],
        'teams': sorted(({'id': r['id'], 'name': r['name']} for r in idx.teams.values()),
                        key=lambda r: views.fold(r['name'])),
        'levels': sorted({r['level'] for r in idx.leagues.values() if r['level'] is not None}),
    }


@app.get('/api/lookup')
def lookup(kind: str, ids: str = ''):
    """Names of a few items by id (filter chips, links)."""
    _, idx = ready()
    table = {'nations': idx.nations, 'leagues': idx.leagues, 'teams': idx.teams, 'players': idx.players,
             'stadiums': idx.stadiums}.get(kind)
    if table is None:
        raise ApiError(400, 'bad_request', kind)
    wanted = [int(x) for x in ids.split(',') if x.strip().lstrip('-').isdigit()][:200]
    return [{'id': i, 'name': table[i]['name']} for i in wanted if i in table]


# ---- details ------------------------------------------------------------------------------------------------------

def _raw(row: dict | None) -> dict:
    return dict(row or {})


@app.get('/api/nations/{nid}')
def nation_detail(nid: int):
    src, idx = ready()
    if nid not in idx.nations:
        raise ApiError(404, 'not_found')
    leagues = sorted((idx.leagues[lid] for lid in src.nation_leagues.get(nid, []) if lid in idx.leagues),
                     key=lambda r: (r['level'] if r['level'] is not None else 99, views.fold(r['name'])))
    team = idx.nations[nid]['national_team_id']
    audio = (src.related_rows('nationid', nid).get('audionation') or [None])[0]
    return {
        **_with_basket('nations', [idx.nations[nid]])[0],
        'names': src.nation_all_names(nid),
        'name_keys': list(fifa14.NATION_NAME_STRINGS),
        'language_names': src.language_names('nation', nid),
        'national_team': {'id': team, 'name': idx.teams[team]['name']} if team in idx.teams else None,
        'leagues': _with_basket('leagues', leagues),
        'flag_files': [{'path': p, 'where': src.files.where(p)} for p in src.flag_files(nid)],
        'audio': _raw(audio) if audio else None,
        'raw': _raw(src.nations[nid]),
    }


def _country_ref(idx, nid) -> dict | None:
    """The country row of the countries list (flag, name, leagues, players), for a league's Countries tab."""
    return _with_basket('nations', [idx.nations[nid]])[0] if nid in idx.nations else None


@app.get('/api/stadiums/{sid}')
def stadium_detail(sid: int):
    src, idx = ready()
    if sid not in idx.stadiums:
        raise ApiError(404, 'not_found')
    teams = sorted((idx.teams[t] for t in src.stadium_teams.get(sid, []) if t in idx.teams),
                   key=lambda r: views.fold(r['name']))
    return {
        **_with_basket('stadiums', [idx.stadiums[sid]])[0],
        'detail': idx.stadium(sid),
        'name_keys': list(fifa14.STADIUM_NAME_STRINGS),
        'language_names': src.language_names('stadium', sid),  # the Data tab (StadiumName_ in every language)
        'teams': [{**r, 'stadium_custom_name': src.stadium_custom_names.get(r['id'])}
                  for r in _with_basket('teams', teams)],
    }


def _board_name(board: dict) -> str:
    """A board file's name (its file name without .rx3: the id of the adboards list and pictures)."""
    return board['path'].rsplit('/', 1)[-1].rsplit('.', 1)[0]


@app.get('/api/leagues/{lid}')
def league_detail(lid: int):
    src, idx = ready()
    if lid not in idx.leagues:
        raise ApiError(404, 'not_found')
    teams = sorted((idx.teams[t] for t in src.league_teams.get(lid, []) if t in idx.teams),
                   key=lambda r: views.fold(r['name']))
    return {
        **_with_basket('leagues', [idx.leagues[lid]])[0],
        'names': src.league_all_names(lid),
        'name_keys': list(fifa14.LEAGUE_NAME_STRINGS),
        'language_names': src.language_names('league', lid),
        'country_row': _country_ref(idx, idx.leagues[lid]['country_id']),
        'images': list(src.league_image_paths(lid)),
        'teams': _with_basket('teams', teams),
        # the league's own board files and whether they go (the selection tree's node; None = it has none)
        'adboards': [{'name': _board_name(b), 'stadium': b['stadium'] or None, 'variant': b['variant']}
                     for b in src.league_adboards(lid)],
        'basket_boards': tree.Tree(basket.data, src).state(f'leagueboards:{lid}') if src.league_adboards(lid) else None,
        'raw': _raw(src.leagues[lid]),
    }


KIT_FIELDS = ('jerseycollargeometrytype', 'jerseynamefonttype', 'jerseynamelayouttype', 'jerseybacknamefontcase',
              'jerseybacknameplacementcode', 'numberfonttype', 'numbercolor', 'jerseyfrontnumberplacementcode',
              'shortsnumberfonttype', 'shortsnumbercolor', 'shortsnumberplacementcode')


def _font_name(src, font) -> str | None:
    """The family name of a name font (jerseyfonts/font_<n>.ttf), as the FIFA 14 Studio lists it."""
    data = src.files.read(fifa14.NAME_FONT.format(font)) if isinstance(font, int) else None
    return kitfonts.family_name(data) if data else None


def _number_ink(src, color) -> list[int] | None:
    """The color a number color code shows (its digits in kitnumbers_1_<color>, as the FIFA 14 Studio reads it)."""
    data = src.files.read(fifa14.NUMBER_FONT.format(1, color)) if isinstance(color, int) else None
    return kitfonts.ink_color(data) if data else None


@app.get('/api/teams/{tid}')
def team_detail(tid: int):
    src, idx = ready()
    if tid not in idx.teams:
        raise ApiError(404, 'not_found')
    row = src.teams[tid]
    kit_rows = src.current_kits(tid)
    kits = []
    for kit_type, path in src.kit_paths(tid).items():
        krow = kit_rows.get(kit_type) or {}
        kits.append({'type': kit_type, 'role': fifa14.KIT_ROLES.get(kit_type), 'source_path': path,
                     'where': src.files.where(path),
                     'name_color': [krow.get('jerseynamecolorr'), krow.get('jerseynamecolorg'),
                                    krow.get('jerseynamecolorb')] if krow else None,
                     'fields': {k: krow.get(k) for k in KIT_FIELDS if k in krow},
                     # what the numbers mean on screen: the name font's family name and the color the digits show
                     'name_font_name': _font_name(src, krow.get('jerseynamefonttype')),
                     'number_rgb': _number_ink(src, krow.get('numbercolor')),
                     'shorts_number_rgb': _number_ink(src, krow.get('shortsnumbercolor'))})
    picked = basket.data['teams'].get(str(tid))
    picked_players = set(picked['players']) if picked else set()
    inside = basket.player_ids()
    roster = []
    for ln in src.team_links.get(tid, []):
        p = idx.players.get(ln['playerid'])
        if p:
            roster.append({**p, 'jersey_number': ln.get('jerseynumber'), 'link_position': ln.get('position'),
                           'back_name': src.player_names(ln['playerid']).get('jersey'),
                           'link_position_name': fifa14.position_name(ln.get('position')),
                           'picked': ln['playerid'] in picked_players, 'in_basket': ln['playerid'] in inside})
    roster.sort(key=lambda r: (r['link_position'] if r['link_position'] is not None else 99, -(r['overall'] or 0)))

    t = tree.Tree(basket.data, src)

    def player_ref(pid):
        pid = pid if isinstance(pid, int) and pid > 0 else None
        return {'id': pid, 'name': idx.players[pid]['name']} if pid in idx.players else None
    return {
        **_with_basket('teams', [idx.teams[tid]])[0],
        'names': src.team_all_names(tid),
        'name_keys': list(fifa14.TEAM_NAME_STRINGS),
        'language_names': src.language_names('team', tid),
        'ratings': {'attack': row.get('attackrating'), 'midfield': row.get('midfieldrating'),
                    'defense': row.get('defenserating')},
        'league_rows': _with_basket('leagues', [idx.leagues[lid] for lid in src.team_leagues.get(tid, [])
                                                if lid in idx.leagues]),
        'colors': [[row.get(f'teamcolor{i}r'), row.get(f'teamcolor{i}g'), row.get(f'teamcolor{i}b')] for i in (1, 2, 3)],
        'leagues': [{'id': lid, 'name': idx.leagues[lid]['name']} for lid in src.team_leagues.get(tid, [])
                    if lid in idx.leagues],
        'crest_where': src.files.where(src.crest_path(tid)) if src.crest_path(tid) else None,
        'crest_no_background': bool(picked and picked['crest_no_background']),
        'kits': kits,
        'roster': roster,
        'captain': player_ref(row.get('captainid')),
        'takers': {k: player_ref(row.get(col)) for k, col in fifa14.TAKERS.items()},
        'formation': src.formation(tid),
        'club': {k: row.get(k) for k in fifa14.CLUB if k in row},
        'rival': {'id': row['rivalteam'], 'name': idx.teams[row['rivalteam']]['name']}
        if row.get('rivalteam') in idx.teams else None,
        'tactics': {k: row.get(k) for k in fifa14.TACTICS if k in row},
        'stadiums': [x for x in (idx.stadium(sid) for sid in src.team_stadiums.get(tid, [])) if x],
        'stadium_custom_name': src.stadium_custom_names.get(tid),
        # the Others tab: the board files a patch names after the team and its ball
        'adboards': [_board_name(b) for b in src.team_adboards(tid)],
        'ball': ({'code': ball, 'name': (idx.equipment['balls'].get(ball) or {}).get('name')}
                 if (ball := t.ball_code(tid)) else None),
        # the team's parts in the basket (the selection tree's nodes): full | none, or None = the team has none
        'basket_parts': {p: t.state(f'{p}:{tid}') if p in t.team_parts(tid) else None for p in tree.TEAM_PARTS},
        'raw': _raw(row),
    }


@app.get('/api/players/{pid}')
def player_detail(pid: int):
    src, idx = ready()
    if pid not in idx.players:
        raise ApiError(404, 'not_found')
    row = src.players[pid]
    face = src.face_paths(pid)
    base = _with_basket('players', [idx.players[pid]])[0]
    t = tree.Tree(basket.data, src)
    gear = {kind: t.gear_code(kind, pid) for kind in tree.PLAYER_PARTS}
    return {
        **base,
        # the Accessories tab: the boot and goalkeeper glove he wears, each with whether it goes in the package (the
        # player's parts in the selection tree: full | none, or None = he has none)
        'boot': ({'code': c, 'name': (idx.equipment['boots'].get(c) or {}).get('name')} if (c := gear['boot']) else None),
        'glove': ({'code': c, 'name': (idx.equipment['gloves'].get(c) or {}).get('name')} if (c := gear['glove']) else None),
        'basket_parts': {k: t.state(base['basket_key'].replace('player:', f'{k}:', 1)) if gear[k] else None
                         for k in tree.PLAYER_PARTS},
        'names': src.player_names(pid),
        'weight': row.get('weight'),
        'preferred_foot': {1: 'right', 2: 'left'}.get(row.get('preferredfoot')),
        'positions': [{'code': p, 'name': fifa14.position_name(p)}
                      for p in (row.get(f'preferredposition{i}') for i in range(1, 5)) if isinstance(p, int) and p >= 0],
        'attributes': {name: row[col] for col, name in fifa14.ATTRIBUTES.items() if col in row},
        'appearance': {col: row[col] for col in fifa14.APPEARANCE if col in row},
        'traits': fifa14.traits_of(row),
        'all_traits': list(fifa14.TRAITS),
        'accessories': {col: row[col] for col in fifa14.ACCESSORIES if col in row},
        'accessory_places': fifa14.accessories_by_place(row),
        'animations': {col: row[col] for col in fifa14.ANIMATIONS if col in row},
        'career': {'contract_until': row.get('contractvaliduntil'), 'joined': fifa14.to_date(row.get('playerjointeamdate')),
                   'retiring': row.get('isretiring')},
        'teams': [{'id': ln['teamid'], 'name': idx.teams[ln['teamid']]['name'] if ln['teamid'] in idx.teams else None,
                   'jersey_number': ln.get('jerseynumber'), 'position': ln.get('position'),
                   'position_name': fifa14.position_name(ln.get('position')),
                   'picked': pid in (basket.data['teams'].get(str(ln['teamid'])) or {}).get('players', [])}
                  for ln in src.player_links.get(pid, [])],
        'standalone': pid in basket.data['players'],
        'face_files': [{'path': p, 'kind': k, 'where': src.files.where(p)} for p, k in (face or {}).items()],
        'photo_where': src.files.where(src.photo_path(pid)) if src.photo_path(pid) else None,
        'raw': _raw(row),
    }


# ---- pictures -----------------------------------------------------------------------------------------------------

class PictureCache:
    """Last PNGs served (decoding a DDS or a kit takes a while; lists ask the same pictures again and again)."""

    def __init__(self, limit=600):
        self.items: OrderedDict = OrderedDict()
        self.limit = limit
        self.lock = Lock()

    def get(self, key, make):
        with self.lock:
            if key in self.items:
                self.items.move_to_end(key)
                return self.items[key]
        data = make()
        with self.lock:
            self.items[key] = data
            while len(self.items) > self.limit:
                self.items.popitem(last=False)
        return data


pictures = PictureCache()
IMAGE_HEADERS = {'Cache-Control': 'private, max-age=86400'}  # URLs carry the source token (?v=)


def _png(key, make):
    src, _ = ready()
    try:
        data = pictures.get((source.token, *key), make)
    except images.UNREADABLE as e:
        raise ApiError(422, 'unreadable_file', str(e))
    if data is None:
        raise ApiError(404, 'not_found')
    return Response(data, media_type='image/png', headers=IMAGE_HEADERS)


def _dds(path, size=None, no_background=False):
    def make():
        src = source.src
        if not path:
            return None
        data = src.files.read(path)
        if data is None:
            return None
        img = images.decode_dds(data)
        if no_background:
            img = images.remove_background(img)
        if size:
            img = images.thumbnail(img, size)
        return images.png(img)
    return make


def _size(size: Optional[int]) -> Optional[int]:
    return min(max(size, 16), 1024) if size else None


@app.get('/api/image/crest/{tid}')
def crest_image(tid: int, size: Optional[int] = None, nobg: bool = False):
    src, _ = ready()
    return _png(('crest', tid, _size(size), nobg), _dds(src.crest_path(tid), _size(size), nobg))


@app.get('/api/image/photo/{pid}')
def photo_image(pid: int, size: Optional[int] = None):
    src, _ = ready()
    return _png(('photo', pid, _size(size)), _dds(src.photo_path(pid), _size(size)))


@app.get('/api/image/league/{lid}/{kind}')
def league_image(lid: int, kind: str, size: Optional[int] = None):
    src, _ = ready()
    return _png(('league', lid, kind, _size(size)), _dds(src.league_image_paths(lid).get(kind), _size(size)))


@app.get('/api/image/flag/{nid}')
def flag_image(nid: int, size: Optional[int] = None):
    src, _ = ready()
    return _png(('flag', nid, _size(size)), _dds(src.flag_path(nid), _size(size)))


@app.get('/api/image/adboard/{name}')
def adboard_image(name: str, size: Optional[int] = None):
    """A board file's picture (512x1024 in the game: 16 bands), or `size` pixels wide."""
    src, _ = ready()
    found = src.all_adboards.get(name)
    s = _size(size)

    def make():
        if not found:
            return None
        data = src.files.read(found['path'])
        textures = rx3.textures(data) if data else []
        if not textures:
            return None
        img = rx3.to_image(data, textures[0])
        if s:
            img = img.resize((s, round(s * img.height / img.width)))
        return images.png(img)
    return _png(('adboard', name, s), make)


@app.get('/api/image/equipment/{kind}/{code}')
def equipment_image(kind: str, code: int, size: Optional[int] = None):
    """A boot, glove or ball drawn from its mesh and colour texture (boots: design 0, else the first one)."""
    one = views.EQUIPMENT_KIND.get(kind)
    src, idx = ready()
    if one is None or code not in idx.equipment[kind]:
        raise ApiError(404, 'not_found')
    width = _size(size) or 512

    def make():
        mesh_path = equipment.mesh_path(one, code)
        texture_path = equipment.texture_path(one, code)
        if not src.files.exists(texture_path):
            others = [p for p in equipment.code_files(one, code, src.files.list(equipment.folder(one)))
                      if p.endswith('_textures.rx3')]
            texture_path = others[0] if others else None
        mesh_stamp = src.files.stamp(mesh_path)
        texture_stamp = src.files.stamp(texture_path) if texture_path else None
        if mesh_stamp is None or texture_stamp is None:
            return None

        def draw():
            mesh, texture = src.files.read(mesh_path), src.files.read(texture_path)
            if mesh is None or texture is None:
                return None
            try:
                return images.png(equipment.thumbnail(one, mesh, texture, width))
            except Exception:  # noqa: BLE001 - a file it cannot draw: the screen shows its placeholder
                log.warning('cannot draw %s %s', one, code, exc_info=True)
                return None
        return _drawn_on_disk(f'{one}|{code}|{width}|{mesh_stamp}|{texture_stamp}', draw)
    return _png(('equipment', kind, code, width), make)


EQUIPMENT_DRAWING = 1  # raise when the drawing changes: the pictures saved on disk are drawn again
DRAWN_DIR = os.path.join(settings.DATA_DIR, 'cache', 'equipment')


def _drawn_on_disk(mark: str, draw) -> bytes | None:
    """A boot, glove or ball picture saved on disk (drawing one from its mesh takes seconds), found again by `mark`:
    what it is plus the stamps of its files (GameFiles.stamp: a file that changes gives a new mark, without reading
    it). A file that cannot be drawn is remembered too (an empty file)."""
    digest = hashlib.sha1(f'{EQUIPMENT_DRAWING}|{mark}'.encode()).hexdigest()
    path = os.path.join(DRAWN_DIR, digest[:2], digest + '.png')
    try:
        with open(path, 'rb') as f:
            data = f.read()
        return data or None
    except OSError:
        pass
    data = draw()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f'{path}.{os.getpid()}.{get_ident()}.tmp'
        with open(tmp, 'wb') as f:
            f.write(data or b'')
        os.replace(tmp, path)
    except OSError:
        log.warning('cannot save the picture %s', path, exc_info=True)
    return data


@app.get('/api/image/stadium/{sid}/{variant}')
def stadium_image(sid: int, variant: int, size: Optional[int] = None):
    src, _ = ready()
    path = (src.stadium_pictures(sid, 'large') or src.stadium_pictures(sid, 'small')).get(variant)
    s = _size(size)

    def make():
        if not path:
            return None
        data = src.files.read(path)
        if data is None:
            return None
        img = images.apt_picture(data)
        return images.png(images.thumbnail(img, s) if s else img)
    return _png(('stadium', sid, variant, s), make)


@app.get('/api/image/kit/{tid}/{kit_type}/{part}')
def kit_image(tid: int, kit_type: int, part: str, size: Optional[int] = None):
    src, _ = ready()
    if part not in images.KIT_TEXTURES:
        raise ApiError(404, 'not_found')
    path = src.kit_paths(tid).get(kit_type)
    s = _size(size)

    def make():
        if not path:
            return None
        data = src.files.read(path)
        img = images.kit_textures(data)[part]
        return images.png(images.thumbnail(img, s) if s else img)
    return _png(('kit', tid, kit_type, part, s), make)


# ---- 3D preview: a player of the game wearing a kit (game meshes as GLB, textures as PNG) -------------------------

PREVIEW_HEADERS = {'Cache-Control': 'private, max-age=3600'}  # URLs carry the source token (?v=)


def _preview(make, media_type: str):
    ready()
    try:
        data = make()
    except (preview.PreviewError, *images.UNREADABLE) as e:
        raise ApiError(404, 'not_found', str(e))
    return Response(data, media_type=media_type, headers=PREVIEW_HEADERS)


@app.get('/api/preview/look/{pid}')
def preview_look(pid: int):
    """How the preview dresses a player (his head, face, hair, skin, boots, height); an unknown id = the model. A
    player whose real face files exist shows them even when his row asks for a generic head (headclasscode 1): they
    are what the package takes."""
    src, _ = ready()
    row = src.players.get(pid)
    if row and src.has_face(pid):
        row = {**row, 'headclasscode': 0}
    out = preview.look(src.files, pid if row else None, row)
    out['generic_in_game'] = bool(row) and src.players[pid].get('headclasscode') != 0 and out['real']
    return out


@app.get('/api/preview/mesh/{part}/{code}.glb')
def preview_mesh(part: str, code: int, collar: int = 0, real: bool = False):
    src, _ = ready()
    return _preview(lambda: preview.mesh_glb(src.files, part, code, collar, real), 'model/gltf-binary')


@app.get('/api/preview/texture/{name}/{code}.png')
def preview_texture(name: str, code: int, real: bool = False):
    src, _ = ready()
    return _preview(lambda: preview.texture_png(src.files, name, code, real), 'image/png')


@app.get('/api/preview/face/{key}.png')
def preview_face(key: str):
    src, _ = ready()
    return _preview(lambda: preview.face_png(src.files, key), 'image/png')


@app.get('/api/preview/kit-print/{tid}/{kind}.png')
def preview_kit_print(tid: int, kind: int, part: str = 'jersey', number: Optional[int] = None,
                      name: Optional[str] = None):
    """What the game draws over the kit's jersey or shorts texture (crest, name, numbers): a transparent picture with
    the same UVs, with the name and number of the player who wears it."""
    src, _ = ready()
    if part not in images.KIT_TEXTURES:
        raise ApiError(404, 'not_found')
    path = src.kit_paths(tid).get(kind)
    values = kitprint.print_of(src.current_kits(tid).get(kind) or {})
    size = (1024, 1024) if part == 'jersey' else (1024, 512)

    def make():
        if not path:
            raise preview.PreviewError(f'team {tid} kit {kind}')
        img = kitprint.decal(src.files, src.files.read(path), part, size, values, number=number, name=name)
        return images.png(img)
    key = (source.token, 'kit-print', tid, kind, part, number, name)
    return _preview(lambda: pictures.get(key, make), 'image/png')


class StadiumCache:
    """The last stadiums built (a big one takes seconds and tens of MB; the page asks for it once per time of day)."""

    def __init__(self, limit=4):
        self.items: OrderedDict = OrderedDict()
        self.limit = limit
        self.lock = Lock()
        self.building = Lock()  # one at a time: two big stadiums at once would only double the wait

    def get(self, key, make):
        with self.lock:
            if key in self.items:
                self.items.move_to_end(key)
                return self.items[key]
        with self.building:
            with self.lock:
                if key in self.items:
                    return self.items[key]
            data = make()
            with self.lock:
                self.items[key] = data
                while len(self.items) > self.limit:
                    self.items.popitem(last=False)
        return data


stadium_models = StadiumCache()


@app.get('/api/preview/stadium/{sid}.glb')
def preview_stadium(sid: int, tod: int = 1):
    """The stadium in 3D (stadium3d.glb); tod 1 = day textures, 3 = night."""
    src, _ = ready()
    if tod not in stadium3d.TIMES:
        raise ApiError(404, 'not_found')
    try:
        data = stadium_models.get((source.token, sid, tod), lambda: stadium3d.glb(src.files, sid, tod))
    except stadium3d.StadiumError as e:
        raise ApiError(404, 'not_found', str(e))
    return Response(data, media_type='model/gltf-binary', headers=PREVIEW_HEADERS)


# ---- basket -------------------------------------------------------------------------------------------------------

class BasketOp(BaseModel):
    op: str
    args: dict[str, Any] = {}


BASKET_OPS = {'tree', 'tree_many', 'add_equipment', 'remove_equipment', 'add_adboard', 'remove_adboard', 'add_stadium', 'remove_stadium', 'add_nation', 'remove_nation', 'add_league', 'remove_league', 'add_team', 'remove_team', 'set_team', 'pick', 'add_players',
              'remove_players', 'clear', 'set_form'}


@app.post('/api/basket')
def basket_op(body: BasketOp):
    if body.op not in BASKET_OPS:
        raise ApiError(400, 'bad_request', body.op)
    src = source.src if source.state == 'ready' else None
    try:
        basket.apply(body.op, src, body.args)
    except (TypeError, ValueError) as e:
        raise ApiError(400, 'bad_request', str(e))
    return basket_counts()


@app.get('/api/basket')
def basket_view():
    """The basket with names (items the loaded game does not have are listed as missing)."""
    d = basket.data
    idx = source.index if source.state == 'ready' else None

    def name(table, i):
        return table[i]['name'] if idx and i in table else None
    nations = [{'id': i, 'name': name(idx.nations, i) if idx else None} for i in d['nations']]
    leagues = [{'id': i, 'name': name(idx.leagues, i) if idx else None} for i in d['leagues']]
    teams = []
    for k, v in d['teams'].items():
        tid = int(k)
        teams.append({'id': tid, 'name': name(idx.teams, tid) if idx else None, 'players': len(v['players']),
                      'roster': idx.teams[tid]['player_count'] if idx and tid in idx.teams else None,
                      'crest_no_background': v['crest_no_background']})
    players = [{'id': i, 'name': name(idx.players, i) if idx else None} for i in d['players']]
    stadiums = [{'id': i, 'name': name(idx.stadiums, i) if idx else None} for i in d['stadiums']]
    adboards = [{'id': i, 'name': i if idx and i in idx.adboards else None} for i in d['adboards']]
    # boots, gloves, balls: found = the loaded game has it; name = the game's name of it (None = has none)
    gear = {kind: [{'id': i, 'found': bool(idx and i in idx.equipment[kind]),
                    'name': idx.equipment[kind][i]['name'] if idx and i in idx.equipment[kind] else None}
                   for i in d[kind]] for kind in views.EQUIPMENT_KIND}
    return {'nations': nations, 'leagues': leagues, 'teams': teams, 'stadiums': stadiums, 'players': players,
            'adboards': adboards, **gear, 'form': d['form'], 'counts': basket_counts()}


@app.get('/api/tree')
def tree_view(key: str = 'root', inside: bool = False):
    """One node of the selection tree and the nodes right inside it (inside: also how many leagues, teams and
    players of it go)."""
    src, idx = ready()
    t = tree.Tree(basket.data, src)
    try:
        node = tree.node_view(t, idx, key, with_inside=inside)
        children = [tree.node_view(t, idx, k) for k in t.children(key)]
    except ValueError:
        raise ApiError(400, 'bad_request', key)
    return {'node': node, 'children': children}


# ---- saved selections ---------------------------------------------------------------------------------------------

class SelectionBody(BaseModel):
    name: str


@app.get('/api/selections')
def list_selections():
    return selections.list()


@app.post('/api/selections')
def save_selection(body: SelectionBody):
    try:
        return selections.save(body.name, basket.data, source.path)
    except ValueError:
        raise ApiError(400, 'name_required')


@app.post('/api/selections/{sid}/load')
def load_selection(sid: str):
    try:
        data = selections.get(sid)
    except KeyError:
        raise ApiError(404, 'not_found')
    basket.replace(data.get('basket') or {})
    return basket_counts()


@app.delete('/api/selections/{sid}')
def delete_selection(sid: str):
    try:
        selections.delete(sid)
    except KeyError:
        raise ApiError(404, 'not_found')
    return {'ok': True}


# ---- export -------------------------------------------------------------------------------------------------------

def _file_name(patch_name: str) -> str:
    slug = re.sub(r'[^A-Za-z0-9._-]+', '-', patch_name or '').strip('-.')[:60]
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    return f'{slug + "-" if slug else ""}{stamp}{package.EXTENSION}'


@app.post('/api/export')
def start_export():
    src, _ = ready()
    form = basket.data['form']
    selection = basket.selection()
    if not (selection.nations or selection.leagues or selection.teams or selection.players or selection.stadiums
            or selection.adboards or selection.boots or selection.gloves or selection.balls):
        raise ApiError(400, 'basket_empty')
    if form.get('credits_url') and not package.normalize_link(form['credits_url']):
        raise ApiError(400, 'invalid_link')
    options = package.Options(patch_name=form.get('patch_name', ''), credits=form.get('credits', ''),
                              credits_url=form.get('credits_url', ''),
                              include_originals=bool(form.get('include_originals', True)),
                              include_stadiums=bool(form.get('include_stadiums', True)),
                              include_adboards=bool(form.get('include_adboards', True)),
                              include_equipment=bool(form.get('include_equipment', True)),
                              tool_version=settings.APP_VERSION)
    cfg = settings.load()
    try:
        job = exports.start(src, selection, options, cfg.exports_dir(), _file_name(form.get('patch_name', '')),
                            workers.plan(cfg.export_cores, cfg.export_memory_percent))
    except RuntimeError:
        raise ApiError(409, 'busy')
    return job.as_dict()


@app.post('/api/export/{job_id}/cancel')
def cancel_export(job_id: str):
    """Asks the running export to stop: it stops before the next item or file and writes nothing."""
    job = exports.jobs.get(job_id)
    if job is None:
        raise ApiError(404, 'not_found')
    if job.state == 'running':
        job.cancel.set()
    return job.as_dict()


@app.get('/api/export/{job_id}')
def export_status(job_id: str):
    job = exports.jobs.get(job_id)
    if job is None:
        raise ApiError(404, 'not_found')
    return job.as_dict()


def _exports_dir() -> str:
    return settings.load().exports_dir()


@app.get('/api/exports')
def list_exports():
    folder = _exports_dir()
    if not os.path.isdir(folder):
        return []
    out = []
    for n in os.listdir(folder):
        full = os.path.join(folder, n)
        if n.endswith(package.EXTENSION) and os.path.isfile(full):
            st = os.stat(full)
            out.append({'name': n, 'size': st.st_size,
                        'modified': datetime.datetime.fromtimestamp(st.st_mtime).astimezone().isoformat(
                            timespec='seconds')})
    return sorted(out, key=lambda e: e['modified'], reverse=True)


def _export_path(name: str) -> str:
    name = os.path.basename(name)
    path = os.path.join(_exports_dir(), name)
    if not name.endswith(package.EXTENSION) or not os.path.isfile(path):
        raise ApiError(404, 'not_found')
    return path


@app.get('/api/exports/{name}')
def download_export(name: str):
    path = _export_path(name)
    return FileResponse(path, media_type='application/zip', filename=os.path.basename(path))


@app.delete('/api/exports/{name}')
def delete_export(name: str):
    os.remove(_export_path(name))
    return {'ok': True}


@app.post('/api/exports/open-folder')
def open_exports_folder():
    folder = _exports_dir()
    os.makedirs(folder, exist_ok=True)
    if hasattr(os, 'startfile'):
        os.startfile(folder)  # noqa: S606 - the user's own folder, opened in Explorer
    return {'path': folder}


# ---- errors and the interface ---------------------------------------------------------------------------------------

@app.exception_handler(ApiError)
def api_error(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail})


if os.path.isdir(settings.FRONTEND_DIST):
    assets = os.path.join(settings.FRONTEND_DIST, 'assets')
    if os.path.isdir(assets):
        app.mount('/assets', StaticFiles(directory=assets), name='assets')

    @app.get('/{path:path}', include_in_schema=False)
    def spa(path: str):
        full = os.path.normpath(os.path.join(settings.FRONTEND_DIST, path))
        if path and full.startswith(os.path.normpath(settings.FRONTEND_DIST)) and os.path.isfile(full):
            return FileResponse(full)
        if path.startswith('api/'):
            raise ApiError(404, 'not_found')
        return FileResponse(os.path.join(settings.FRONTEND_DIST, 'index.html'), headers={'Cache-Control': 'no-cache'})
