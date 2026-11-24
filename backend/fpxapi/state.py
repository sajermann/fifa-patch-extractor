"""What the backend keeps while it runs: the loaded game (read in a background thread), the export basket, the saved
selections and the export jobs."""
import datetime
import json
import logging
import os
import threading
import time
import uuid

from fpx import fifa14, package

from . import settings
from .views import Index

log = logging.getLogger('fpxapi')


def _now() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec='seconds')


def _write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _read_json(path: str):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ---- the loaded game --------------------------------------------------------------------------------------------

class SourceHolder:
    """The game being browsed. Loading runs in a thread; `status()` tells the interface where it is."""

    def __init__(self):
        self.lock = threading.Lock()
        self.src: fifa14.Fifa14Source | None = None
        self.index: Index | None = None
        self.path: str | None = None
        self.state = 'empty'  # empty | loading | ready | error
        self.error: str | None = None
        self.loaded_at: float | None = None
        self.token = ''  # changes on every load (image URLs carry it, so the browser never mixes two games)

    def load(self, path: str, language: str) -> None:
        with self.lock:
            if self.state == 'loading':
                raise RuntimeError('busy')
            self.state, self.error, self.path = 'loading', None, path
        threading.Thread(target=self._load, args=(path, language), daemon=True).start()

    def _load(self, path: str, language: str) -> None:
        started = time.time()
        try:
            src = fifa14.Fifa14Source(path, language)
            index = Index(src)
        except fifa14.SourceError as e:
            with self.lock:
                self.state, self.error = 'error', str(e)
            return
        except Exception as e:  # noqa: BLE001 - the interface shows it; the cause goes to the log
            log.exception('loading %s failed', path)
            with self.lock:
                self.state, self.error = 'error', f'{type(e).__name__}: {e}'
            return
        with self.lock:
            self.src, self.index, self.state = src, index, 'ready'
            self.loaded_at = time.time()
            self.token = uuid.uuid4().hex[:8]
        log.info('loaded %s in %.1f s', path, time.time() - started)

    def status(self) -> dict:
        out = {'state': self.state, 'path': self.path, 'error': self.error, 'token': self.token}
        if self.state == 'ready' and self.src:
            src = self.src
            out.update({
                'game_dir': src.files.root,
                'database_from': src.database_source,
                'language': src.language,
                'languages': src.languages(),
                'counts': {'leagues': len(src.leagues), 'teams': len(src.teams), 'players': len(src.players),
                           'nations': len(src.nations), 'stadiums': len(src.stadiums), 'adboards': len(src.all_adboards)},
                'suspect_birthdates': [fifa14.to_date(d) for d in sorted(src.suspect_birthdates)],
                'warnings': src.warnings,
            })
        return out


# ---- the export basket ------------------------------------------------------------------------------------------

def empty_basket() -> dict:
    """nations: [ids]; leagues: [ids]; teams: {"<id>": {"players": [ids], "crest_no_background": bool}}; players:
    [ids] that go without a team; stadiums: [ids] picked on their own; adboards: [board file names] picked on their
    own; form: the export screen's fields."""
    return {'nations': [], 'leagues': [], 'teams': {}, 'players': [], 'stadiums': [], 'adboards': [],
            'form': {'patch_name': '', 'credits': '', 'credits_url': '', 'include_originals': True,
                     'include_stadiums': True, 'include_adboards': True}}


class Basket:
    def __init__(self, path: str):
        self.path = path
        self.lock = threading.Lock()
        self.data = self._load()

    def _load(self) -> dict:
        data = _read_json(self.path)
        out = empty_basket()
        if isinstance(data, dict):
            out['nations'] = [i for i in data.get('nations', []) if isinstance(i, int)]  # missing in older baskets
            out['leagues'] = [i for i in data.get('leagues', []) if isinstance(i, int)]
            teams = data.get('teams', {})
            if isinstance(teams, dict):
                for k, v in teams.items():
                    if str(k).isdigit() and isinstance(v, dict):
                        out['teams'][str(k)] = {'players': [i for i in v.get('players', []) if isinstance(i, int)],
                                                'crest_no_background': bool(v.get('crest_no_background'))}
            out['players'] = [i for i in data.get('players', []) if isinstance(i, int)]
            out['stadiums'] = [i for i in data.get('stadiums', []) if isinstance(i, int)]  # missing in older baskets
            out['adboards'] = [i for i in data.get('adboards', []) if isinstance(i, str)]  # missing in older baskets
            if isinstance(data.get('form'), dict):
                out['form'].update({k: v for k, v in data['form'].items() if k in out['form']})
        return out

    def save(self) -> None:
        _write_json(self.path, self.data)

    def replace(self, data: dict) -> None:
        with self.lock:
            _write_json(self.path, data)
            self.data = self._load()

    # ---- operations (src: the loaded game, for "a league = its teams", "a team = its roster") ----

    def apply(self, op: str, src: fifa14.Fifa14Source | None, args: dict) -> None:
        with self.lock:
            getattr(self, f'_op_{op}')(src, **args)
            self.save()

    def _need(self, src):
        if src is None:
            raise ValueError('no game loaded')
        return src

    def _op_add_nation(self, src, id: int):
        """A country with its leagues (and their teams)."""
        src = self._need(src)
        if id not in self.data['nations']:
            self.data['nations'].append(id)
        for lid in src.nation_leagues.get(id, []):
            self._op_add_league(src, lid)

    def _op_remove_nation(self, src, id: int, with_leagues: bool = True):
        self.data['nations'] = [i for i in self.data['nations'] if i != id]
        if with_leagues and src:
            for lid in src.nation_leagues.get(id, []):
                self._op_remove_league(src, lid)

    def _op_add_stadium(self, src, id: int):
        if id not in self.data['stadiums']:
            self.data['stadiums'].append(id)

    def _op_remove_stadium(self, src, id: int):
        self.data['stadiums'] = [i for i in self.data['stadiums'] if i != id]

    def _op_add_adboard(self, src, id: str):
        if not isinstance(id, str) or not id:
            raise ValueError('id')
        if id not in self.data['adboards']:
            self.data['adboards'].append(id)

    def _op_remove_adboard(self, src, id: str):
        self.data['adboards'] = [i for i in self.data['adboards'] if i != id]

    def _op_add_league(self, src, id: int):
        src = self._need(src)
        if id not in self.data['leagues']:
            self.data['leagues'].append(id)
        for tid in src.league_teams.get(id, []):
            self._op_add_team(src, tid)

    def _op_remove_league(self, src, id: int, with_teams: bool = True):
        self.data['leagues'] = [i for i in self.data['leagues'] if i != id]
        if with_teams and src:
            for tid in src.league_teams.get(id, []):
                self.data['teams'].pop(str(tid), None)

    def _op_add_team(self, src, id: int, players: list[int] | None = None):
        src = self._need(src)
        roster = [ln['playerid'] for ln in src.team_links.get(id, [])]
        if str(id) not in self.data['teams']:
            self.data['teams'][str(id)] = {'players': roster if players is None else
                                           [p for p in players if p in set(roster)],
                                           'crest_no_background': False}

    def _op_remove_team(self, src, id: int):
        self.data['teams'].pop(str(id), None)

    def _op_set_team(self, src, id: int, players: list[int] | None = None, crest_no_background: bool | None = None):
        team = self.data['teams'].get(str(id))
        if team is None:
            self._op_add_team(src, id, players)
            team = self.data['teams'][str(id)]
        elif players is not None:
            team['players'] = list(dict.fromkeys(players))
        if crest_no_background is not None:
            team['crest_no_background'] = bool(crest_no_background)

    def _op_pick(self, src, team: int, player: int, on: bool):
        """One player in or out of a team's roster (a team not in the basket comes in with only this player)."""
        picked = self.data['teams'].get(str(team))
        if picked is None:
            if on:
                self._op_add_team(src, team, [player])
            return
        if on and player not in picked['players']:
            picked['players'].append(player)
        elif not on:
            picked['players'] = [p for p in picked['players'] if p != player]

    def _op_add_players(self, src, ids: list[int]):
        inside = self.player_ids()
        for pid in ids:
            if pid not in inside and pid not in self.data['players']:
                self.data['players'].append(pid)

    def _op_remove_players(self, src, ids: list[int]):
        gone = set(ids)
        self.data['players'] = [p for p in self.data['players'] if p not in gone]
        for team in self.data['teams'].values():
            team['players'] = [p for p in team['players'] if p not in gone]

    def _op_clear(self, src):
        form = self.data['form']
        self.data = empty_basket()
        self.data['form'] = form

    def _op_set_form(self, src, **fields):
        for k, v in fields.items():
            if k in self.data['form']:
                self.data['form'][k] = bool(v) if k.startswith('include_') else str(v or '')

    # ---- reading ----

    def player_ids(self) -> set[int]:
        out = set(self.data['players'])
        for team in self.data['teams'].values():
            out.update(team['players'])
        return out

    def selection(self) -> package.Selection:
        return package.Selection(
            nations=list(self.data['nations']),
            leagues=list(self.data['leagues']),
            teams={int(k): package.TeamPick(list(v['players']), v['crest_no_background'])
                   for k, v in self.data['teams'].items()},
            players=list(self.data['players']),
            stadiums=list(self.data['stadiums']),
            adboards=list(self.data['adboards']))


# ---- saved selections -------------------------------------------------------------------------------------------

class Selections:
    """Baskets saved under a name: <data>/selections/<id>.json."""

    def __init__(self, folder: str):
        self.folder = folder

    def _path(self, sid: str) -> str:
        if not sid or not all(c in '0123456789abcdef' for c in sid):
            raise KeyError(sid)
        return os.path.join(self.folder, f'{sid}.json')

    def _all(self) -> list[dict]:
        if not os.path.isdir(self.folder):
            return []
        found = (_read_json(os.path.join(self.folder, n)) for n in os.listdir(self.folder) if n.endswith('.json'))
        return [d for d in found if isinstance(d, dict) and d.get('id') and d.get('name')]

    @staticmethod
    def _summary(d: dict) -> dict:
        b = d.get('basket') or {}
        teams = b.get('teams') or {}
        players = set(b.get('players') or [])
        for t in teams.values():
            players.update(t.get('players') or [])
        return {'id': d['id'], 'name': d['name'], 'created_at': d.get('created_at'), 'updated_at': d.get('updated_at'),
                'source_path': d.get('source_path'), 'nations': len(b.get('nations') or []),
                'leagues': len(b.get('leagues') or []), 'teams': len(teams),
                'stadiums': len(b.get('stadiums') or []),
                'adboards': len(b.get('adboards') or []),
                'players': len(players)}

    def list(self) -> list[dict]:
        return sorted((self._summary(d) for d in self._all()), key=lambda s: s['updated_at'] or '', reverse=True)

    def save(self, name: str, basket: dict, source_path: str | None) -> dict:
        name = (name or '').strip()
        if not name:
            raise ValueError('name')
        same = next((d for d in self._all() if d['name'].strip().lower() == name.lower()), None)
        now = _now()
        data = {'id': same['id'] if same else uuid.uuid4().hex, 'name': name,
                'created_at': same.get('created_at', now) if same else now, 'updated_at': now,
                'source_path': source_path, 'basket': basket}
        _write_json(self._path(data['id']), data)
        return self._summary(data)

    def get(self, sid: str) -> dict:
        data = _read_json(self._path(sid))
        if not isinstance(data, dict):
            raise KeyError(sid)
        return data

    def delete(self, sid: str) -> None:
        path = self._path(sid)
        if not os.path.isfile(path):
            raise KeyError(sid)
        os.remove(path)


# ---- export jobs ------------------------------------------------------------------------------------------------

class ExportJob:
    def __init__(self):
        self.id = uuid.uuid4().hex[:12]
        self.state = 'running'  # running | done | error
        self.done = 0
        self.total = 0
        self.error: str | None = None
        self.result: dict | None = None

    def as_dict(self) -> dict:
        return {'id': self.id, 'state': self.state, 'done': self.done, 'total': self.total, 'error': self.error,
                'result': self.result}


class Exports:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs: dict[str, ExportJob] = {}

    def running(self) -> ExportJob | None:
        return next((j for j in self.jobs.values() if j.state == 'running'), None)

    def start(self, src, selection, options, folder: str, file_name: str) -> ExportJob:
        with self.lock:
            if self.running():
                raise RuntimeError('busy')
            job = ExportJob()
            self.jobs = {job.id: job}  # only the last job is kept
        threading.Thread(target=self._run, args=(job, src, selection, options, folder, file_name), daemon=True).start()
        return job

    def _run(self, job, src, selection, options, folder, file_name):
        def progress(done, total):
            job.done, job.total = done, total
        try:
            pkg = package.build(src, selection, options, progress)
            path = os.path.join(folder, file_name)
            package.write(pkg, path)
            m = pkg.manifest
            job.result = {'name': file_name, 'path': path, 'size': os.path.getsize(path), 'warnings': pkg.warnings,
                          'counts': {k: len(m[k]) for k in ('nations', 'leagues', 'teams', 'players', 'stadiums', 'adboards')}}
            job.state = 'done'
        except Exception as e:  # noqa: BLE001 - shown on the export screen; the cause goes to the log
            log.exception('export failed')
            job.state, job.error = 'error', f'{type(e).__name__}: {e}'
