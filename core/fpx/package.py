"""The neutral package: leagues, teams and players of a FIFA installation exactly as the source game has them.

One zip with `package.json` at the root (see PACKAGE_FORMAT.md). Every item has:
  - `raw`: the database rows that belong to it, every column, values as stored;
  - common fields read from those rows (names with their accents, codes as the game uses them, ids of the source);
  - pictures decoded to PNG (and, optionally, the original files under `game/<game path>`);
  - files that have no decoded form (fonts, face models) always as originals under `game/<game path>`.
Nothing is converted for any destination: whoever imports the package decides how to use each value.
"""
import datetime
import json
import os
import zipfile
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from . import fifa14, images, kitfonts, rx3

FORMAT = 'fifa-patch-package'
FORMAT_VERSION = 1
MANIFEST = 'package.json'
EXTENSION = '.fifapkg.zip'


@dataclass
class TeamPick:
    players: list[int] = field(default_factory=list)  # the roster that goes (source player ids)
    crest_no_background: bool = False  # also ship the crest with its light tile removed (and prefer it)


@dataclass
class Selection:
    nations: list[int] = field(default_factory=list)  # countries picked on their own (the referenced ones go anyway)
    leagues: list[int] = field(default_factory=list)
    teams: dict[int, TeamPick] = field(default_factory=dict)
    players: list[int] = field(default_factory=list)  # players that go without a team
    stadiums: list[int] = field(default_factory=list)  # stadiums picked on their own (go even without include_stadiums)

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
    tool_name: str = 'fifa-patch-extractor'
    tool_version: str = '0.0.0'


@dataclass
class Package:
    manifest: dict
    files: dict[str, bytes]
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


def _id(value):
    """A database id, or None for the 'none' values (0, -1, missing)."""
    return value if isinstance(value, int) and value > 0 else None


# tables with a stadiumid that describe matches or saves, not the stadium
STADIUM_RAW_SKIP = ('fixtures', 'career_managerpref', 'teamstadiumlinkscache')


class _Builder:
    def __init__(self, src: fifa14.Fifa14Source, selection: Selection, options: Options):
        self.src = src
        self.sel = selection
        self.opt = options
        self.files: dict[str, bytes] = {}
        self.warnings: list[str] = []
        self.nation_ids: set[int] = set()
        self.stadium_ids: set[int] = set()

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
        if self.opt.include_stadiums:
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

    def build(self, progress=None) -> Package:
        """progress(done, total), if given, is called after each league, team, player and stadium."""
        league_ids, player_ids = list(dict.fromkeys(self.sel.leagues)), self.sel.player_ids()
        self.nation_ids.update(self.sel.nations)
        self.stadium_ids.update(self.sel.stadiums)
        team_stadiums = ({s for tid in self.sel.teams for s in self.src.team_stadiums.get(tid, [])}
                         if self.opt.include_stadiums else set())
        stadium_count = len(team_stadiums | set(self.sel.stadiums))
        total, done = len(league_ids) + len(self.sel.teams) + len(player_ids) + stadium_count, 0

        def step(item):
            nonlocal done
            done += 1
            if progress:
                progress(done, total)
            return item

        leagues = [x for x in (step(self.league(lid)) for lid in league_ids) if x]
        teams = [x for x in (step(self.team(tid, pick)) for tid, pick in self.sel.teams.items()) if x]
        rosters = {t['source_id']: {r['player_id'] for r in t['roster']} for t in teams}
        players = [x for x in (step(self.player(pid, rosters)) for pid in player_ids) if x]
        stadiums = [x for x in (step(self.stadium(sid)) for sid in sorted(self.stadium_ids)) if x]
        nations = [x for x in (self.nation(nid) for nid in sorted(self.nation_ids)) if x]
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
            'credits': credits or None,
            'leagues': leagues,
            'teams': teams,
            'players': players,
            'nations': nations,
            'stadiums': stadiums,
        }
        return Package(manifest, self.files, self.warnings)


def build(src: fifa14.Fifa14Source, selection: Selection, options: Options | None = None, progress=None) -> Package:
    return _Builder(src, selection, options or Options()).build(progress)


def safe_name(name: str) -> bool:
    """A zip entry name that stays inside the archive."""
    return bool(name) and not name.startswith(('/', '\\')) and '..' not in name.split('/') and ':' not in name \
        and '\\' not in name


def write(package: Package, path: str) -> None:
    """Writes the package zip atomically (a .tmp file renamed at the end)."""
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(MANIFEST, json.dumps(package.manifest, ensure_ascii=False, indent=1))
        for name, data in sorted(package.files.items()):
            if not safe_name(name):
                raise ValueError(f'unsafe file name in package: {name}')
            z.writestr(name, data)
    os.replace(tmp, path)
