import json
import os
import zipfile

import pytest

import fakegame
from fpx import package
from fpx.fifa14 import Fifa14Source
from fpx.package import Options, Selection, TeamPick


def _roster(src, tid):
    return [ln['playerid'] for ln in src.team_links[tid]]


@pytest.fixture(scope='module')
def src(loose_game):
    return Fifa14Source(loose_game)


def test_league_team_players(src):
    pkg = package.build(src, Selection(leagues=[fakegame.LEAGUE],
                                       teams={fakegame.TEAM: TeamPick(_roster(src, fakegame.TEAM), True)}),
                        Options(patch_name='My patch', credits='Someone', credits_url='example.com'))
    m = pkg.manifest
    assert m['format'] == 'fifa-patch-package' and m['format_version'] == 1
    assert m['source']['game'] == 'fifa14' and m['source']['patch_name'] == 'My patch'
    assert m['credits'] == {'text': 'Someone', 'url': 'https://example.com'}
    league, = m['leagues']
    assert league['source_id'] == fakegame.LEAGUE and league['country_nation_id'] == 54
    assert league['names']['full'] == 'Test Premier Division of Nowhere'
    assert set(league['images']) == {'logo', 'banner'}
    assert league['raw']['leagues'][0]['leaguename'] == 'Test League (1)'
    team, = m['teams']
    assert team['names']['abbr3'] == 'TAT' and team['league_ids'] == [fakegame.LEAGUE]
    assert team['colors']['primary'] == [200, 10, 20]
    assert team['crest']['preferred'] == 'no_background' and team['crest']['image_no_background'] in pkg.files
    assert team['captain_id'] == fakegame.STAR and team['takers']['penalty'] == fakegame.STAR
    assert len(team['roster']) == 16 and {k['role'] for k in team['kits']} == {'home', 'away', 'goalkeeper'}
    home = team['kits'][0]
    assert home['collar'] == 3 and home['jersey'] in pkg.files and home['print_positions'] == fakegame.KIT_POSITIONS
    assert home['number_font']['ink_color'] == [250, 250, 250] and home['number_font']['file'] in pkg.files
    assert home['shorts_number_font']['ink_color'] == [10, 10, 10]  # read through its chunkzip container
    assert home['name_font']['file'] == 'game/data/sceneassets/jerseyfonts/font_2.ttf'
    assert team['raw']['teamstadiumlinks'] == [{'teamid': fakegame.TEAM, 'stadiumid': 3}]
    assert len(team['raw']['teamkits']) == 4  # every kit row, the classic one too
    players = {p['source_id']: p for p in m['players']}
    assert len(players) == 16
    star = players[fakegame.STAR]
    assert star['names']['last'] == 'Plàyer' and star['birthdate'] and not star['birthdate_suspect']
    assert star['attributes']['overall'] == 95 and star['positions'][0]['name'] == 'ST'
    assert star['face'] and all(f['file'] in pkg.files for f in star['face']['files'].values())
    assert star['photo']['image'] in pkg.files and star['photo']['original'] in pkg.files
    assert star['teams'] == [{'team_id': fakegame.TEAM, 'jersey_number': 10, 'position': 25, 'position_name': 'ST'}]
    assert players[fakegame.KEEPER]['face'] is None
    assert {n['source_id'] for n in m['nations']} == {54}
    assert pkg.warnings == []


def test_values_are_not_adapted(src):
    """Codes, texts and positions go exactly as the source has them (sub/reserve positions included)."""
    roster = _roster(src, fakegame.TEAM)
    pkg = package.build(src, Selection(teams={fakegame.TEAM: TeamPick(roster)}))
    team = pkg.manifest['teams'][0]
    subs = [r for r in team['roster'] if r['position'] == 28]
    assert subs and all(r['position_name'] == 'SUB' for r in subs)
    assert team['league_ids'] == [fakegame.LEAGUE]  # the source's links, even with the league left out
    assert 'image_no_background' not in team['crest'] and 'preferred' not in team['crest']
    for p in pkg.manifest['players']:
        row = src.players[p['source_id']]
        assert p['appearance']['headtypecode'] == row['headtypecode'] >= 2500
        assert p['height'] == row['height']


def test_partial_roster_and_standalone_player(src):
    small_roster = _roster(src, fakegame.SMALL_TEAM)
    pkg = package.build(src, Selection(
        teams={fakegame.TEAM: TeamPick([fakegame.STAR, fakegame.SHARED]), fakegame.SMALL_TEAM: TeamPick(small_roster)},
        players=[fakegame.KEEPER]))
    players = {p['source_id']: p for p in pkg.manifest['players']}
    assert set(players) == {fakegame.STAR, fakegame.KEEPER} | set(small_roster)
    assert {t['team_id'] for t in players[fakegame.SHARED]['teams']} == {fakegame.TEAM, fakegame.SMALL_TEAM}
    assert players[fakegame.KEEPER]['teams'] == []  # went alone
    assert players[fakegame.KEEPER]['names']['first'] == 'Edited'
    assert len(players[fakegame.KEEPER]['raw']['teamplayerlinks']) == 1  # raw keeps the source's links
    assert players[small_roster[1]]['birthdate_suspect'] is True


def test_unreadable_files_are_left_out(src):
    pkg = package.build(src, Selection(teams={fakegame.SMALL_TEAM: TeamPick(_roster(src, fakegame.SMALL_TEAM))}))
    team = pkg.manifest['teams'][0]
    assert team['crest'] is None and team['kits'] == []
    assert len(pkg.warnings) == 2


def test_without_originals(src):
    pkg = package.build(src, Selection(teams={fakegame.TEAM: TeamPick([fakegame.STAR])}),
                        Options(include_originals=False))
    team = pkg.manifest['teams'][0]
    assert 'original' not in team['crest'] and 'original' not in team['kits'][0]
    assert not any(n.startswith('game/data/ui/') or n.endswith('kit_7001_0_0.rx3') for n in pkg.files)
    star = pkg.manifest['players'][0]
    assert all(f['file'] in pkg.files for f in star['face']['files'].values())  # faces have no other form


def test_write_zip(src, tmp_path):
    pkg = package.build(src, Selection(leagues=[fakegame.LEAGUE]))
    path = str(tmp_path / f'out{package.EXTENSION}')
    package.write(pkg, path)
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read('package.json'))
        assert manifest['leagues'][0]['images']['logo']['image'] in z.namelist()
    assert not os.path.exists(path + '.tmp')
    bad = package.Package({}, {'../evil.txt': b'x'}, [])
    with pytest.raises(ValueError):
        package.write(bad, str(tmp_path / 'bad.zip'))


def test_archived_install_gives_the_same_package(loose_game, archived_game):
    sel = Selection(leagues=[fakegame.LEAGUE], teams={fakegame.TEAM: TeamPick([fakegame.STAR])})
    a = package.build(Fifa14Source(loose_game), sel).manifest
    b = package.build(Fifa14Source(archived_game), sel).manifest
    for m in (a, b):
        m.pop('created_at')
        m['source'].pop('database_from')
    # the loose crest of the archived install is another picture: same structure, other bytes
    assert a == b


def test_normalize_link():
    assert package.normalize_link('site.com/x') == 'https://site.com/x'
    assert package.normalize_link('javascript:alert(1)') is None
    assert package.normalize_link('ftp://a.com') is None
    assert package.normalize_link('') is None
