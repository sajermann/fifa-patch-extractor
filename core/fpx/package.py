"""The neutral package: leagues, teams and players of a FIFA installation exactly as the source game has them.

One zip with `package.json` at the root (see PACKAGE_FORMAT.md). Every item has:
  - `raw`: the database rows that belong to it, every column, values as stored;
  - common fields read from those rows (names with their accents, codes as the game uses them, ids of the source);
  - pictures decoded to PNG (and, optionally, the original files under `game/<game path>`);
  - files that have no decoded form (fonts, face models) always as originals under `game/<game path>`.
Nothing is converted for any destination: whoever imports the package decides how to use each value.
"""
import datetime
import hashlib
import json
import os
import shutil
import threading
import zipfile
import zlib
from collections import deque
from collections.abc import MutableMapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from . import equipment as gear_files, fifa14, images, kitfonts, rx3

FORMAT = 'fifa-patch-package'
FORMAT_VERSION = 1
MANIFEST = 'package.json'
EXTENSION = '.fifapkg.zip'


@dataclass
class TeamPick:
    players: list[int] = field(default_factory=list)  # the roster that goes (source player ids)
    crest_no_background: bool = False  # also ship the crest with its light tile removed (and prefer it)
    # the team's parts that go with it (each also needs its include_* option)
    stadium: bool = True
    ball: bool = True
    adboards: bool = True


@dataclass
class Selection:
    nations: list[int] = field(default_factory=list)  # countries picked on their own (the referenced ones go anyway)
    leagues: list[int] = field(default_factory=list)
    teams: dict[int, TeamPick] = field(default_factory=dict)
    players: list[int] = field(default_factory=list)  # players that go without a team
    stadiums: list[int] = field(default_factory=list)  # stadiums picked on their own (go even without include_stadiums)
    adboards: list[str] = field(default_factory=list)  # board files picked on their own (file names, see all_adboards)
    # boots, goalkeeper gloves and balls picked on their own (codes; go even without include_equipment)
    boots: list[int] = field(default_factory=list)
    gloves: list[int] = field(default_factory=list)
    balls: list[int] = field(default_factory=list)
    league_no_adboards: list[int] = field(default_factory=list)  # leagues that go without their board files
    no_gear: dict[int, list[str]] = field(default_factory=dict)  # player id -> kinds left out ('boot', 'glove')

    def player_ids(self) -> list[int]:
        out = dict.fromkeys(self.players)
        for pick in self.teams.values():
            out.update(dict.fromkeys(pick.players))
        return list(out)


@dataclass
class Options:
    patch_name: str = ''
    credits: str = ''
    credits_url: str = ''
    include_originals: bool = True
    include_stadiums: bool = True  # the stadium of every exported team, with its scene files (large)
    include_adboards: bool = True  # the board files of every exported team and league
    include_equipment: bool = True  # the boots and gloves of the exported players, the balls of the exported teams
    #                                (the ones picked on their own go anyway)
    tool_name: str = 'fifa-patch-extractor'
    tool_version: str = '0.0.0'


# the steps an export goes through, in order (progress: see build() and write())
EXPORT_STEPS = ('prepare', 'leagues', 'teams', 'players', 'stadiums', 'nations', 'adboards', 'equipment', 'write')
COMPRESS_LEVEL = 6  # zip deflate level (zipfile's default)


class ExportCancelled(Exception):
    pass


class _Progress:
    """Tells the caller where the export is: progress(dict) with step (EXPORT_STEPS), step_done/step_total, done/total
    (items of every step but 'write'; the countries join the total once known), item ({kind, id, name}: the last one
    that started) and, while writing, bytes_done/bytes_total. Also checks the cancel event."""

    def __init__(self, fn=None, cancel: threading.Event | None = None):
        self.fn, self.cancel = fn, cancel
        self.lock = threading.Lock()
        self.state = {'step': None, 'step_done': 0, 'step_total': 0, 'done': 0, 'total': 0, 'item': None,
                      'bytes_done': 0, 'bytes_total': 0}

    def check(self):
        if self.cancel is not None and self.cancel.is_set():
            raise ExportCancelled()

    def send(self, **changes):
        with self.lock:
            self.state.update(changes)
            snapshot = dict(self.state)
        if self.fn:
            self.fn(snapshot)

    def step(self, name: str, total: int = 0):
        self.check()
        self.send(step=name, step_done=0, step_total=total, item=None)

    def started(self, kind: str, oid, name):
        self.check()
        self.send(item={'kind': kind, 'id': oid, 'name': name})

    def finished(self):
        with self.lock:
            self.state['step_done'] += 1
            self.state['done'] += 1
        self.send()


class Spool(MutableMapping):
    """The package's files kept in a folder instead of the memory (a whole patch passes tens of GB): {zip name:
    bytes} as a dict, each value a file named by the hash of its key. Safe from several threads. close() removes
    the folder."""

    def __init__(self, folder: str):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self._sizes: dict[str, int] = {}
        self._lock = threading.Lock()

    def _path(self, key: str) -> str:
        return os.path.join(self.folder, hashlib.sha1(key.encode('utf-8')).hexdigest())

    def __setitem__(self, key: str, data: bytes) -> None:
        with open(self._path(key), 'wb') as f:
            f.write(data)
        with self._lock:
            self._sizes[key] = len(data)

    def __getitem__(self, key: str) -> bytes:
        if key not in self._sizes:
            raise KeyError(key)
        with open(self._path(key), 'rb') as f:
            return f.read()

    def __delitem__(self, key: str) -> None:
        with self._lock:
            del self._sizes[key]
        os.remove(self._path(key))

    def __contains__(self, key) -> bool:
        return key in self._sizes

    def __iter__(self):
        return iter(list(self._sizes))

    def __len__(self) -> int:
        return len(self._sizes)

    def size(self, key: str) -> int:
        return self._sizes[key]

    def close(self) -> None:
        shutil.rmtree(self.folder, ignore_errors=True)


def _size(files, key: str) -> int:
    return files.size(key) if isinstance(files, Spool) else len(files[key])


@dataclass
class Package:
    manifest: dict
    files: MutableMapping  # zip name -> bytes: a dict, or a Spool (build(spool=...)) on the disk
    warnings: list[str]


def normalize_link(url) -> str | None:
    """http(s) links only; 'site.com' gets https://; anything else = None."""
    if not isinstance(url, str):
        return None
    url = url.strip()
    if not url or any(c.isspace() for c in url):
        return None
    if '://' not in url:
        head = url.split('/', 1)[0]
        if ':' in head and not head.rsplit(':', 1)[-1].isdigit():
            return None
        url = 'https://' + url
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    host = parts.hostname or ''
    if parts.scheme.lower() not in ('http', 'https') or not host or ('.' not in host and host != 'localhost'):
        return None
    return url


def _rgb(row: dict, r: str, g: str, b: str):
    values = [row.get(r), row.get(g), row.get(b)]
    return values if all(isinstance(v, int) for v in values) else None


def _board_picture(data: bytes):
    """The texture of a board file (512x1024 in the game: 16 bands of 512x64)."""
    found = rx3.textures(data)
    if not found:
        raise ValueError('no texture')
    return rx3.to_image(data, found[0])


def _id(value):
    """A database id, or None for the 'none' values (0, -1, missing)."""
    return value if isinstance(value, int) and value > 0 else None


# tables with a stadiumid that describe matches or saves, not the stadium
STADIUM_RAW_SKIP = ('fixtures', 'career_managerpref', 'teamstadiumlinkscache')

EQUIPMENT_LISTS = {'boot': 'boots', 'glove': 'gloves', 'ball': 'balls'}
# a player's own eyes and hair (a real face), and the generic ones the game shows when a real face lacks them
GENERIC_FACE_OWN = {'eyes': 'data/sceneassets/heads/eyes_{}_0_textures.rx3',
                    'hair': 'data/sceneassets/hair/hair_{}_0_0.rx3',
                    'hair_textures': 'data/sceneassets/hair/hair_{}_0_textures.rx3',
                    'hairlod': 'data/sceneassets/hairlod/hairlod_{}_0_0.rx3'}
GENERIC_PARTS = {'eyes': 'data/sceneassets/heads/eyes_{}_1_textures.rx3',
                 'hair': 'data/sceneassets/hair/hair_{}_1_0.rx3',
                 'hair_textures': 'data/sceneassets/hair/hair_{}_1_textures.rx3',
                 'hairlod': 'data/sceneassets/hairlod/hairlod_{}_1_0.rx3'}  # the manifest's list of each kind


class _Builder:
    def __init__(self, src: fifa14.Fifa14Source, selection: Selection, options: Options, spool: str | None = None):
        self.src = src
        self.sel = selection
        self.opt = options
        self.files: MutableMapping = Spool(spool) if spool else {}
        self.warnings: list[str] = []
        self.nation_ids: set[int] = set()
        self.stadium_ids: set[int] = set()
        # generic parts of the source (codes) a real face that lacks its own needs: see generic_parts()
        self.generic_needed: dict[str, set[int]] = {'eyes': set(), 'hair': set(), 'hairlod': set()}

    # ---- files ----------------------------------------------------------------------------------------------

    def _read(self, game_path: str, what: str) -> bytes | None:
        try:
            data = self.src.files.read(game_path)
        except images.UNREADABLE as e:
            self.warnings.append(f'{what}: {game_path} ({e})')
            return None
        if data is None:
            self.warnings.append(f'{what}: {game_path} (missing)')
        return data

    def _original(self, game_path: str, data: bytes) -> str:
        name = f'game/{game_path}'
        self.files[name] = data
        return name

    def _picture(self, game_path: str | None, zip_path: str, what: str, decode=images.decode_dds, extra=None):
        """{'image': zip path of the PNG, 'original': ...} of one picture, or None when it cannot be read."""
        if not game_path:
            return None
        data = self._read(game_path, what)
        if data is None:
            return None
        try:
            img = decode(data)
        except images.UNREADABLE as e:
            self.warnings.append(f'{what}: {game_path} ({e})')
            return None
        self.files[zip_path] = images.png(img)
        out = {'image': zip_path, 'source_path': game_path}
        if extra:
            out.update(extra(img))
        if self.opt.include_originals:
            out['original'] = self._original(game_path, data)
        return out

    def _adboards(self, boards: list[dict], folder: str, what: str, keys: tuple) -> list[dict]:
        """The board files of a team or a league, decoded: [{image, source_path, original?, <keys>}] (0 = any -> None)."""
        out = []
        for b in boards:
            name = '_'.join(str(b[k]) for k in keys)
            pic = self._picture(b['path'], f'{folder}/adboards/{name}.png', what, decode=_board_picture)
            if pic:
                out.append({**pic, **{k: b[k] or None for k in keys if k != 'variant'}, 'variant': b['variant']})
        return out

    def adboard(self, name: str) -> dict | None:
        """A board file picked on its own: {name, kind, image, source_path, original?, ...its name's numbers}."""
        found = self.src.all_adboards.get(name)
        if found is None:
            self.warnings.append(f'adboard {name}: not in the game')
            return None
        pic = self._picture(found['path'], f'adboards/{name}.png', f'adboard {name}', decode=_board_picture)
        if pic is None:
            return None
        keys = ('number', 'group') if found['kind'] == 'game' else ('team', 'tournament', 'stadium', 'variant')
        return {'name': name, 'kind': found['kind'], **pic, **{k: found[k] for k in keys}}

    def equipment(self, kind: str, code: int, names: dict[int, str], listing: list[str]) -> dict | None:
        """A boot, glove or ball: {source_id, name, files, picture?, raw}."""
        rows = gear_files.EQUIPMENT[kind][5]
        files = {}
        for path in gear_files.code_files(kind, code, listing):
            data = self._read(path, f'{kind} {code}')
            if data is not None:
                files[path] = self._original(path, data)
        if not files:
            self.warnings.append(f'{kind} {code}: no files in the game')
            return None
        out = {'source_id': code, 'name': names.get(code), 'files': files}
        if kind == 'ball':
            picture = gear_files.BALL_PICTURE.format(code)
            if self.src.files.exists(picture):
                pic = self._picture(picture, f'balls/{code}/picture.png', f'ball {code} picture', decode=images.apt_picture)
                if pic:
                    out['picture'] = pic
                    files[picture] = pic.get('original') or self._original(picture, self.src.files.read(picture))
        if rows:
            table, column = rows
            out['raw'] = {table: [r for r in self.src.rows(table) if r.get(column) == code]}
        else:
            out['raw'] = {}
        return out

    def equipment_codes(self, team_ids: list[int], player_ids: list[int]) -> dict[str, list[int]]:
        """The codes that go of each kind: the ones picked on their own, plus (include_equipment) the boots and gloves
        of the exported players and the balls of the exported teams."""
        out = {}
        for kind in gear_files.KINDS:
            table, column = gear_files.EQUIPMENT[kind][:2]
            codes = {c for c in getattr(self.sel, EQUIPMENT_LISTS[kind]) if isinstance(c, int) and c > 0}
            if self.opt.include_equipment:
                if table == 'players':
                    rows = [self.src.players.get(pid) for pid in player_ids
                            if kind not in self.sel.no_gear.get(pid, ())]
                else:
                    rows = [self.src.teams.get(tid) for tid in team_ids
                            if self.sel.teams.get(tid, TeamPick()).ball]
                codes |= {r.get(column) for r in rows if r and isinstance(r.get(column), int) and r.get(column) > 0}
            out[kind] = sorted(codes)
        return out

    def all_equipment(self, codes: dict[str, list[int]], prog: '_Progress | None' = None, pool=None) -> dict[str, list[dict]]:
        prog = prog or _Progress()
        prog.step('equipment', sum(len(c) for c in codes.values()))
        out = {}
        for kind in gear_files.KINDS:
            names = gear_files.names(self.src, kind) if codes[kind] else {}
            listing = list(self.src.files.list(gear_files.folder(kind))) if codes[kind] else []

            def one(code, kind=kind, names=names, listing=listing):
                prog.check()
                prog.started(kind, code, names.get(code))
                try:
                    return self.equipment(kind, code, names, listing)
                finally:
                    prog.finished()
            found = pool.map(one, codes[kind]) if pool else map(one, codes[kind])
            out[kind] = [x for x in found if x]
        return out

    # ---- items ----------------------------------------------------------------------------------------------

    def league(self, lid: int) -> dict | None:
        row = self.src.leagues.get(lid)
        if row is None:
            self.warnings.append(f'league {lid}: not in the database')
            return None
        country = _id(row.get('countryid'))
        if country:
            self.nation_ids.add(country)
        pictures = {}
        for kind, path in self.src.league_image_paths(lid).items():
            pic = self._picture(path, f'leagues/{lid}/{kind}.png', f'league {lid} {kind}')
            if pic:
                pictures[kind] = pic
        return {
            'source_id': lid,
            'names': self.src.league_all_names(lid),
            'level': row.get('level'),
            'country_nation_id': country,
            'team_ids': self.src.league_teams.get(lid, []),
            'images': pictures,
            'adboards': self._adboards(self.src.league_adboards(lid), f'leagues/{lid}', f'league {lid} adboard',
                                       ('stadium', 'variant'))
            if self.opt.include_adboards and lid not in self.sel.league_no_adboards else [],
            'raw': self.src.related_rows('leagueid', lid),
        }

    def _font(self, path: str | None, what: str, family=False) -> dict | None:
        if not path:
            return None
        data = self._read(path, what)
        if data is None:
            return None
        out = {'file': self._original(path, data), 'source_path': path}
        if family:
            name = kitfonts.family_name(data)
            if name:
                out['family_name'] = name
        return out

    def kit(self, tid: int, kit_type: int, path: str, row: dict | None) -> dict | None:
        what = f'team {tid} kit {kit_type}'
        data = self._read(path, what)
        if data is None:
            return None
        try:
            textures = images.kit_textures(data)
        except images.UNREADABLE as e:
            self.warnings.append(f'{what}: {path} ({e})')
            return None
        base = f'teams/{tid}/kits/{kit_type}'
        for part, img in textures.items():
            self.files[f'{base}/{part}.png'] = images.png(img)
        try:
            positions = rx3.positions(rx3.unpack(data))
        except images.UNREADABLE:
            positions = None
        out = {
            'type': kit_type,
            'role': fifa14.KIT_ROLES.get(kit_type),
            'jersey': f'{base}/jersey.png',
            'shorts': f'{base}/shorts.png',
            'source_path': path,
            'print_positions': positions,
        }
        if self.opt.include_originals:
            out['original'] = self._original(path, data)
        if row:
            number_font, number_color = row.get('numberfonttype'), row.get('numbercolor')
            shorts_font, shorts_color = row.get('shortsnumberfonttype'), row.get('shortsnumbercolor')
            number_file = self._font(self.src.number_font_path(number_font, number_color), f'{what} number font')
            shorts_file = self._font(self.src.number_font_path(shorts_font, shorts_color), f'{what} shorts font')
            out.update({
                'colors': {k: v for k, v in {
                    'primary': _rgb(row, 'teamcolorprimr', 'teamcolorprimg', 'teamcolorprimb'),
                    'secondary': _rgb(row, 'teamcolorsecr', 'teamcolorsecg', 'teamcolorsecb'),
                    'tertiary': _rgb(row, 'teamcolortertr', 'teamcolortertg', 'teamcolortertb'),
                }.items() if v},
                'name_color': _rgb(row, 'jerseynamecolorr', 'jerseynamecolorg', 'jerseynamecolorb'),
                'name_font': {'id': row.get('jerseynamefonttype'),
                              **(self._font(self.src.name_font_path(row.get('jerseynamefonttype')),
                                            f'{what} name font', family=True) or {})},
                'name_layout': row.get('jerseynamelayouttype'),
                'name_case': row.get('jerseybacknamefontcase'),
                'back_name_placement': row.get('jerseybacknameplacementcode'),
                'number_font': {'id': number_font, 'color': number_color, **(number_file or {}),
                                **({'ink_color': ink} if number_file and (ink := kitfonts.ink_color(
                                    self.files[number_file['file']])) else {})},
                'front_number_placement': row.get('jerseyfrontnumberplacementcode'),
                'shorts_number_font': {'id': shorts_font, 'color': shorts_color, **(shorts_file or {}),
                                       **({'ink_color': ink} if shorts_file and (ink := kitfonts.ink_color(
                                           self.files[shorts_file['file']])) else {})},
                'shorts_number_placement': row.get('shortsnumberplacementcode'),
                'collar': row.get('jerseycollargeometrytype'),
            })
        return out

    def team(self, tid: int, pick: TeamPick) -> dict | None:
        row = self.src.teams.get(tid)
        if row is None:
            self.warnings.append(f'team {tid}: not in the database')
            return None
        roster_ids = set(pick.players)
        links = [ln for ln in self.src.team_links.get(tid, []) if ln['playerid'] in roster_ids]
        crest = None
        crest_path = self.src.crest_path(tid)
        if crest_path:
            def no_background(img):
                if not pick.crest_no_background:
                    return {}
                name = f'teams/{tid}/crest-no-background.png'
                self.files[name] = images.png(images.remove_background(img))
                return {'image_no_background': name, 'preferred': 'no_background'}
            crest = self._picture(crest_path, f'teams/{tid}/crest.png', f'team {tid} crest', extra=no_background)
        kits_rows = self.src.current_kits(tid)
        kits = []
        for kit_type, path in self.src.kit_paths(tid).items():
            k = self.kit(tid, kit_type, path, kits_rows.get(kit_type))
            if k:
                kits.append(k)
        raw = self.src.related_rows('teamid', tid, skip=('teamplayerlinks',))
        if links:
            raw['teamplayerlinks'] = links
        kit_rows = self.src.team_kits.get(tid)
        if kit_rows:
            raw['teamkits'] = kit_rows
        nation = self.src.national_teams.get(tid)
        if nation:
            self.nation_ids.add(nation)
        stadiums = self.src.team_stadiums.get(tid, [])
        if self.opt.include_stadiums and pick.stadium:
            self.stadium_ids.update(stadiums)
        return {
            'source_id': tid,
            'names': self.src.team_all_names(tid),
            'colors': {k: v for k, v in {
                'primary': _rgb(row, 'teamcolor1r', 'teamcolor1g', 'teamcolor1b'),
                'secondary': _rgb(row, 'teamcolor2r', 'teamcolor2g', 'teamcolor2b'),
                'tertiary': _rgb(row, 'teamcolor3r', 'teamcolor3g', 'teamcolor3b'),
            }.items() if v},
            'league_ids': self.src.team_leagues.get(tid, []),
            'national_team_of': nation,
            'overall': row.get('overallrating'),
            'crest': crest,
            'kits': kits,
            'roster': [{'player_id': ln['playerid'], 'jersey_number': ln.get('jerseynumber'),
                        'position': ln.get('position'), 'position_name': fifa14.position_name(ln.get('position'))}
                       for ln in links],
            'captain_id': _id(row.get('captainid')),
            'takers': {k: _id(row.get(col)) for k, col in fifa14.TAKERS.items()},
            'formation': self.src.formation(tid),
            'stadium_ids': stadiums,
            'stadium_custom_name': self.src.stadium_custom_names.get(tid),
            'adboard_tournament_id': self.src.team_tournament(tid),
            'adboards': self._adboards(self.src.team_adboards(tid), f'teams/{tid}', f'team {tid} adboard',
                                       ('tournament', 'stadium', 'variant'))
            if self.opt.include_adboards and pick.adboards else [],
            'raw': raw,
        }

    def player(self, pid: int, team_rosters: dict[int, set[int]]) -> dict | None:
        row = self.src.players.get(pid)
        if row is None:
            self.warnings.append(f'player {pid}: not in the database')
            return None
        nationality = _id(row.get('nationality'))
        if nationality:
            self.nation_ids.add(nationality)
        positions = [row.get(f'preferredposition{i}') for i in range(1, 5)]
        positions = [p for p in positions if isinstance(p, int) and p >= 0]
        face = None
        face_files = self.src.face_paths(pid)
        if face_files:
            stored = {}
            for path, kind in face_files.items():
                data = self._read(path, f'player {pid} face')
                if data is not None:
                    stored[path] = {'kind': kind, 'file': self._original(path, data)}
            if all(k in {v['kind'] for v in stored.values()} for k in fifa14.FACE_REQUIRED):
                face = {'files': stored}
                self._note_generic(pid, row, stored)
        raw = self.src.related_rows('playerid', pid)
        name_ids = {row.get(c) for c in ('firstnameid', 'lastnameid', 'commonnameid', 'playerjerseynameid')}
        names_rows = [r for i in sorted(n for n in name_ids if isinstance(n, int))
                      for r in self.src._by('playernames', 'nameid').get(i, [])]
        if names_rows:
            raw['playernames'] = names_rows
        birthdate = row.get('birthdate')
        return {
            'source_id': pid,
            'names': self.src.player_names(pid),
            'birthdate': fifa14.to_date(birthdate),
            'birthdate_suspect': birthdate in self.src.suspect_birthdates,
            'height': row.get('height'),
            'weight': row.get('weight'),
            'preferred_foot': {1: 'right', 2: 'left'}.get(row.get('preferredfoot')),
            'positions': [{'code': p, 'name': fifa14.position_name(p)} for p in positions],
            'nationality_id': nationality,
            'attributes': {name: row[col] for col, name in fifa14.ATTRIBUTES.items() if col in row},
            'traits': fifa14.traits_of(row),
            'appearance': {col: row[col] for col in fifa14.APPEARANCE if col in row},
            'photo': self._picture(self.src.photo_path(pid), f'players/{pid}/photo.png', f'player {pid} photo'),
            'face': face,
            'teams': [{'team_id': ln['teamid'], 'jersey_number': ln.get('jerseynumber'),
                       'position': ln.get('position'), 'position_name': fifa14.position_name(ln.get('position'))}
                      for ln in self.src.player_links.get(pid, []) if pid in team_rosters.get(ln['teamid'], ())],
            'raw': raw,
        }

    def _note_generic(self, pid: int, row: dict, stored: dict) -> None:
        """A real face without its own eyes, hair or hair seen from afar: the source game shows the generic ones of
        the player's codes (eyecolorcode, hairtypecode) in their place, so the package takes those generic files too
        (generic_parts). Hair code 0 is no hair (the game has no generic of it): nothing to take."""
        paths = {p.lower() for p in stored}
        eyes = isinstance(row.get('eyecolorcode'), int) and row['eyecolorcode'] > 0
        if eyes and GENERIC_FACE_OWN['eyes'].format(pid) not in paths:
            self.generic_needed['eyes'].add(row['eyecolorcode'])
        hair = isinstance(row.get('hairtypecode'), int) and row['hairtypecode'] > 0
        if hair and not all(GENERIC_FACE_OWN[k].format(pid) in paths for k in ('hair', 'hair_textures')):
            self.generic_needed['hair'].add(row['hairtypecode'])
        elif hair and GENERIC_FACE_OWN['hairlod'].format(pid) not in paths:
            self.generic_needed['hairlod'].add(row['hairtypecode'])

    def generic_parts(self) -> dict:
        """{'eyes': {code: {file}}, 'hair': {code: {files: {kind: file}}}, 'hairlod': {code: {file}}} of the generic
        parts noted by
        _note_generic, as the source game has them (a patch may change them or add its own codes; a code the source
        has no files of is left out)."""
        out: dict = {'eyes': {}, 'hair': {}, 'hairlod': {}}
        for key in ('eyes', 'hairlod'):
            for code in sorted(self.generic_needed[key]):
                path = GENERIC_PARTS[key].format(code)
                if self.src.files.exists(path) and (data := self._read(path, f'generic {key} {code}')) is not None:
                    out[key][str(code)] = {'file': self._original(path, data), 'source_path': path}
        for code in sorted(self.generic_needed['hair']):
            files = {}
            for kind in ('hair', 'hair_textures', 'hairlod'):
                path = GENERIC_PARTS[kind].format(code)  # a code the source has no files of: left out, as there
                if self.src.files.exists(path) and (data := self._read(path, f'generic hair {code}')) is not None:
                    files[kind] = self._original(path, data)
            if 'hair' in files and 'hair_textures' in files:
                out['hair'][str(code)] = {'files': files}
        return out

    def nation(self, nid: int) -> dict | None:
        row = self.src.nations.get(nid)
        if row is None:
            self.warnings.append(f'nation {nid}: not in the database')
            return None
        flag_path = self.src.flag_path(nid)
        flag_files = []
        if self.opt.include_originals:
            for path in self.src.flag_files(nid):
                if path != flag_path and (data := self._read(path, f'nation {nid} flag')) is not None:
                    flag_files.append(self._original(path, data))
        out = {
            'source_id': nid,
            'name': row.get('nationname'),
            'names': self.src.nation_all_names(nid),
            'national_team_id': _id(row.get('teamid')),
            'confederation': row.get('confederation'),
            'top_tier': row.get('top_tier'),
            'league_ids': self.src.nation_leagues.get(nid, []),
            'flag': self._picture(flag_path, f'nations/{nid}/flag.png', f'nation {nid} flag'),
            'raw': self.src.related_rows('nationid', nid),
        }
        if flag_files:
            out['flag_files'] = flag_files
        return out

    def stadium(self, sid: int) -> dict | None:
        row = self.src.stadiums.get(sid)
        if row is None:
            self.warnings.append(f'stadium {sid}: not in the database')
            return None
        country = _id(row.get('countrycode'))
        if country:
            self.nation_ids.add(country)
        pictures = []
        found = self.src.stadium_pictures(sid, 'large') or self.src.stadium_pictures(sid, 'small')
        for variant, path in found.items():
            pic = self._picture(path, f'stadiums/{sid}/picture-{variant}.png', f'stadium {sid} picture',
                                decode=images.apt_picture)
            if pic:
                pictures.append({'variant': variant, **pic})
        if self.opt.include_originals:
            for size in ('large', 'small'):
                for path in self.src.stadium_pictures(sid, size).values():
                    if f'game/{path}' not in self.files and (data := self._read(path, f'stadium {sid}')) is not None:
                        self._original(path, data)
        files = {}
        for path in self.src.stadium_files(sid):
            data = self._read(path, f'stadium {sid}')
            if data is not None:
                files[path] = self._original(path, data)
        return {
            'source_id': sid,
            'names': self.src.stadium_all_names(sid),
            'capacity': row.get('capacity'),
            'year_built': row.get('yearbuilt'),
            'country_nation_id': country,
            'home_team_id': _id(row.get('hometeamid')),
            'team_ids': self.src.stadium_teams.get(sid, []),
            'conditions': self.src.stadium_conditions(sid),
            'pictures': pictures,
            'files': files,
            'raw': self.src.related_rows('stadiumid', sid, skip=STADIUM_RAW_SKIP),
        }

    def _names(self, kind: str, oid) -> str | None:
        """The name the progress shows (never fails: the id is shown instead)."""
        try:
            if kind == 'player':
                return self.src.player_display_name(oid)
            if kind == 'team':
                return self.src.team_display_name(oid)
            if kind == 'league':
                return self.src.league_display_name(oid)
            if kind == 'stadium':
                return self.src.stadium_display_name(oid)
            if kind == 'nation':
                return self.src.nation_name(oid)
        except Exception:  # noqa: BLE001 - only the progress text
            return None
        return str(oid) if kind == 'adboard' else None

    def _run(self, prog: _Progress, pool, step: str, kind: str, keys: list, fn) -> list:
        """fn(key) of every key, in threads, the results in the order of the keys (None = left out)."""
        prog.step(step, len(keys))

        def one(key):
            prog.check()
            prog.started(kind, key, self._names(kind, key))
            try:
                return fn(key)
            finally:
                prog.finished()
        found = pool.map(one, keys) if pool else map(one, keys)
        return [x for x in found if x]

    def build(self, progress=None, workers: int = 1, cancel: threading.Event | None = None) -> Package:
        """progress(dict), if given, is told about each step and item (_Progress); workers: threads reading and
        decoding the items (reading a file of the game, unpacking it and making the PNGs let the other threads run);
        cancel: set it to stop (ExportCancelled)."""
        prog = _Progress(progress, cancel)
        prog.step('prepare')
        league_ids, player_ids = list(dict.fromkeys(self.sel.leagues)), self.sel.player_ids()
        self.nation_ids.update(self.sel.nations)
        self.stadium_ids.update(self.sel.stadiums)
        team_stadiums = ({s for tid, pick in self.sel.teams.items() if pick.stadium
                          for s in self.src.team_stadiums.get(tid, [])}
                         if self.opt.include_stadiums else set())
        stadium_count = len(team_stadiums | set(self.sel.stadiums))
        board_names = list(dict.fromkeys(self.sel.adboards))
        gear_codes = self.equipment_codes(list(self.sel.teams), player_ids)
        total = len(league_ids) + len(self.sel.teams) + len(player_ids) + stadium_count + len(board_names) + \
            sum(len(c) for c in gear_codes.values())
        prog.send(total=total)
        pool = ThreadPoolExecutor(max_workers=workers) if workers > 1 else None
        try:
            leagues = self._run(prog, pool, 'leagues', 'league', league_ids, self.league)
            picks = self.sel.teams
            teams = self._run(prog, pool, 'teams', 'team', list(picks), lambda tid: self.team(tid, picks[tid]))
            rosters = {t['source_id']: {r['player_id'] for r in t['roster']} for t in teams}
            players = self._run(prog, pool, 'players', 'player', player_ids, lambda pid: self.player(pid, rosters))
            generic = self.generic_parts()
            stadiums = self._run(prog, pool, 'stadiums', 'stadium', sorted(self.stadium_ids), self.stadium)
            nation_ids = sorted(self.nation_ids)  # known only now: the leagues, players and stadiums add theirs
            prog.send(total=prog.state['total'] + len(nation_ids))
            nations = self._run(prog, pool, 'nations', 'nation', nation_ids, self.nation)
            boards = self._run(prog, pool, 'adboards', 'adboard', board_names, self.adboard)
            gear = self.all_equipment(gear_codes, prog, pool)
        finally:
            if pool:
                pool.shutdown(wait=True, cancel_futures=True)
        credits = {k: v for k, v in {'text': (self.opt.credits or '').strip() or None,
                                     'url': normalize_link(self.opt.credits_url)}.items() if v}
        manifest = {
            'format': FORMAT,
            'format_version': FORMAT_VERSION,
            'source': {
                'game': fifa14.GAME,
                'platform': fifa14.PLATFORM,
                'patch_name': (self.opt.patch_name or '').strip() or None,
                'language': self.src.language,
                'database_from': self.src.database_source,
            },
            'tool': {'name': self.opt.tool_name, 'version': self.opt.tool_version},
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'includes_originals': self.opt.include_originals,
            'includes_stadiums': self.opt.include_stadiums,
            'includes_adboards': self.opt.include_adboards,
            'includes_equipment': self.opt.include_equipment,
            'credits': credits or None,
            'leagues': leagues,
            'teams': teams,
            'players': players,
            'nations': nations,
            'stadiums': stadiums,
            'adboards': boards,
            'generic_parts': generic,
            **{EQUIPMENT_LISTS[k]: gear[k] for k in gear_files.KINDS},
        }
        return Package(manifest, self.files, self.warnings)


def build(src: fifa14.Fifa14Source, selection: Selection, options: Options | None = None, progress=None,
          workers: int = 1, cancel: threading.Event | None = None, spool: str | None = None) -> Package:
    """spool: a folder for the files instead of the memory (Package.files is a Spool; close() it when done)."""
    builder = _Builder(src, selection, options or Options(), spool)
    try:
        return builder.build(progress, workers, cancel)
    except BaseException:
        if isinstance(builder.files, Spool):
            builder.files.close()
        raise


def safe_name(name: str) -> bool:
    """A zip entry name that stays inside the archive."""
    return bool(name) and not name.startswith(('/', '\\')) and '..' not in name.split('/') and ':' not in name \
        and '\\' not in name


class _Ready:
    """A 'compressor' that hands zipfile the bytes already compressed by a thread (zipfile still counts the size and
    the CRC of the original bytes itself)."""

    def __init__(self, data: bytes):
        self.data = data

    def compress(self, _):
        data, self.data = self.data, b''
        return data

    def flush(self):
        return b''


def _deflate(data: bytes) -> bytes:
    c = zlib.compressobj(COMPRESS_LEVEL, zlib.DEFLATED, -15)  # raw deflate, as in a zip
    return c.compress(data) + c.flush()


def write(package: Package, path: str, progress=None, workers: int = 1, cancel: threading.Event | None = None,
          memory_budget: int = 512 * 2 ** 20) -> None:
    """Writes the package zip atomically (a .tmp file renamed at the end). progress(dict): step 'write' with
    step_done/step_total (files) and bytes_done/bytes_total; workers: threads compressing the next files while one is
    written (about memory_budget bytes compressed and waiting at most); cancel: stops it (ExportCancelled, no file)."""
    prog = _Progress(progress, cancel)
    names = sorted(package.files)
    for name in names:
        if not safe_name(name):
            raise ValueError(f'unsafe file name in package: {name}')
    manifest = json.dumps(package.manifest, ensure_ascii=False, indent=1).encode('utf-8')
    files = package.files
    items = [MANIFEST] + names
    sizes = {MANIFEST: len(manifest), **{n: _size(files, n) for n in names}}

    def read(name):
        return manifest if name == MANIFEST else files[name]
    prog.send(step='write', step_done=0, step_total=len(items), item=None, bytes_done=0,
              bytes_total=sum(sizes.values()))
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    tmp = path + '.tmp'
    pool = ThreadPoolExecutor(max_workers=workers) if workers > 1 else None
    try:
        with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=COMPRESS_LEVEL) as z:
            for i, (name, data, packed) in enumerate(_compressed(items, read, sizes, pool, workers, memory_budget)):
                prog.check()
                prog.send(item={'kind': 'file', 'id': None, 'name': name})
                info = zipfile.ZipInfo(name, date_time=datetime.datetime.now().timetuple()[:6])
                info.compress_type, info.compress_level = zipfile.ZIP_DEFLATED, COMPRESS_LEVEL
                info.external_attr = 0o600 << 16
                info.file_size = len(data)
                with z.open(info, 'w', force_zip64=len(data) > zipfile.ZIP64_LIMIT // 2) as out:
                    if packed is not None and hasattr(out, '_compressor'):
                        out._compressor = _Ready(packed)  # noqa: SLF001 - compressed by a thread (see _Ready)
                    out.write(data)
                with prog.lock:
                    prog.state['step_done'] = i + 1
                    prog.state['bytes_done'] += len(data)
                prog.send()
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    finally:
        if pool:
            pool.shutdown(wait=True, cancel_futures=True)


def _compressed(names: list[str], read, sizes: dict[str, int], pool, workers: int, budget: int):
    """(name, data, compressed or None) in order; with a pool, the next files are read and compressed ahead in
    threads (about `budget` bytes waiting at most)."""
    if pool is None:
        for name in names:
            yield name, read(name), None
        return

    def load(name):
        data = read(name)
        return data, _deflate(data)
    pending: deque = deque()
    waiting = 0
    it = iter(names)
    while True:
        while len(pending) < workers * 4 and (not pending or waiting < budget):
            name = next(it, None)
            if name is None:
                break
            pending.append((name, pool.submit(load, name)))
            waiting += sizes[name]
        if not pending:
            return
        name, future = pending.popleft()
        waiting -= sizes[name]
        data, packed = future.result()
        yield name, data, packed
