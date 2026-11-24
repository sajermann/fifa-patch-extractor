import io
import json
import os
import zipfile

import pytest
from PIL import Image

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
    assert star['traits'] == ['leadership', 'finesse_shot', 'one_club_player']
    assert team['formation']['name'] == '4-4-2' and team['formation']['base'] == 8
    assert [p['name'] for p in team['formation']['positions']][:3] == ['GK', 'RB', 'CB']
    assert team['formation']['positions'][0]['y'] == pytest.approx(0.05)  # a float32 of the database
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


def test_nation_picked_alone(src):
    """A country picked on its own: every name, its leagues, the flag files and the rows that belong to it."""
    pkg = package.build(src, Selection(nations=[54]))
    nation, = pkg.manifest['nations']
    assert nation['name'] == 'Nowhereland'  # the database name, as before
    assert nation['names'] == {'database': 'Nowhereland', 'full': 'Republic of Nowhere', 'abbr3': 'NWH'}
    assert nation['league_ids'] == [fakegame.LEAGUE]
    assert nation['flag']['image'] in pkg.files and nation['flag']['original'] in pkg.files
    assert nation['flag_files'] == ['game/data/ui/artassets/countryflags/f_54.big']
    assert nation['raw']['audionation'][0]['chantregionindex'] == 7
    assert pkg.manifest['leagues'] == [] and pkg.manifest['stadiums'] == []


def test_team_stadium(src):
    pkg = package.build(src, Selection(teams={fakegame.TEAM: TeamPick([fakegame.STAR])}))
    team = pkg.manifest['teams'][0]
    assert team['stadium_ids'] == [fakegame.STADIUM] and team['stadium_custom_name'] == 'Custom Park'
    stadium, = pkg.manifest['stadiums']
    assert stadium['source_id'] == fakegame.STADIUM and stadium['names'] == {'database': 'Test Ground', 'full': 'Test Arena'}
    assert stadium['capacity'] == 12345 and stadium['year_built'] == 1901
    assert stadium['home_team_id'] == fakegame.TEAM and stadium['team_ids'] == [fakegame.TEAM]
    assert stadium['country_nation_id'] == 54 and 54 in {n['source_id'] for n in pkg.manifest['nations']}
    assert set(stadium['files']) == set(fakegame.STADIUM_FILES)  # the home team's dressing and the crowd too
    assert all(pkg.files[z] == fakegame.STADIUM_FILES[p] for p, z in stadium['files'].items())
    assert [p['variant'] for p in stadium['pictures']] == [1, 3]
    picture = Image.open(io.BytesIO(pkg.files[stadium['pictures'][0]['image']]))
    assert picture.size == fakegame.STADIUM_PICTURE  # cut to what the menu draws
    assert stadium['conditions'] == [{'time_of_day': 1, 'rain': True, 'snow': True},  # unused slots (5) left out
                                     {'time_of_day': 3, 'rain': True, 'snow': False}]
    assert stadium['raw']['stadiums'][0]['name'] == 'Test Ground'
    assert pkg.manifest['includes_stadiums'] is True and pkg.warnings == []

    without = package.build(src, Selection(teams={fakegame.TEAM: TeamPick([fakegame.STAR])}),
                            Options(include_stadiums=False))
    assert without.manifest['stadiums'] == [] and without.manifest['teams'][0]['stadium_ids'] == [fakegame.STADIUM]
    assert not any('stadium' in n for n in without.files)

    alone = package.build(src, Selection(stadiums=[fakegame.STADIUM]), Options(include_stadiums=False))
    stadium, = alone.manifest['stadiums']  # picked on its own: goes even with the team stadiums off
    assert stadium['source_id'] == fakegame.STADIUM and alone.manifest['teams'] == []
    assert {n['source_id'] for n in alone.manifest['nations']} == {54}  # its country


def test_stadium_3d(src):
    """The scene as GLB: the wall with its texture found by name (the textures file has another order) and the baked
    light on the 2nd UV set; the sky left out; meters."""
    from fpx import stadium3d
    assert stadium3d.available(src.files, fakegame.STADIUM) == [1]  # no night textures in the fake game
    assert stadium3d.available(src.files, 999) == []
    glb = stadium3d.glb(src.files, fakegame.STADIUM, 1)
    length = int.from_bytes(glb[12:16], 'little')
    doc = json.loads(glb[20:20 + length])
    assert [n['name'] for n in doc['nodes']] == ['mesh0']  # the sky mesh is not there
    mat, = doc['materials']
    assert mat['name'] == 'diffuseopaque' and mat['occlusionTexture']['texCoord'] == 1
    position = doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    assert position['max'] == [10.0, 5.0, 0.0]  # cm in the file, meters in the GLB
    binary = glb[20 + length + 8:]

    def color(tex):
        view = doc['bufferViews'][doc['images'][doc['textures'][tex]['source']]['bufferView']]
        data = binary[view['byteOffset']:view['byteOffset'] + view['byteLength']]
        return Image.open(io.BytesIO(data)).convert('RGB').getpixel((4, 4))
    assert color(mat['pbrMetallicRoughness']['baseColorTexture']['index'])[0] > 180  # 'wall' is red
    assert color(mat['occlusionTexture']['index'])[0] in range(110, 150)  # 'lm_0' is grey
    with pytest.raises(stadium3d.StadiumError):
        stadium3d.glb(src.files, fakegame.STADIUM, 3)


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


def test_adboards_of_a_patch(src):
    """The board files of a patch's stadium script, by team and by league, as the source names them."""
    pkg = package.build(src, Selection(leagues=[fakegame.LEAGUE, fakegame.PLAIN_LEAGUE],
                                       teams={fakegame.TEAM: TeamPick([]), fakegame.SMALL_TEAM: TeamPick([])}))
    league = {lg['source_id']: lg for lg in pkg.manifest['leagues']}
    teams = {tm['source_id']: tm for tm in pkg.manifest['teams']}
    team = teams[fakegame.TEAM]
    assert team['adboard_tournament_id'] == fakegame.LEAGUE
    assert [(b['tournament'], b['stadium'], b['variant']) for b in team['adboards']] == [(None, None, 1), (fakegame.LEAGUE, None, 0)]
    board = team['adboards'][1]
    assert board['source_path'] == f'data/sceneassets/adboard/specificadboard_{fakegame.TEAM}_{fakegame.LEAGUE}_0_0.rx3'
    assert board['image'] == f'teams/{fakegame.TEAM}/adboards/{fakegame.LEAGUE}_0_0.png' and board['original'] in pkg.files
    assert Image.open(io.BytesIO(pkg.files[board['image']])).convert('RGB').getpixel((1, 1)) == (200, 0, 0)
    assert [(b['stadium'], b['variant']) for b in league[fakegame.LEAGUE]['adboards']] == [(None, 0)]
    assert league[fakegame.PLAIN_LEAGUE]['adboards'] == [] and teams[fakegame.SMALL_TEAM]['adboards'] == []
    assert teams[fakegame.SMALL_TEAM]['adboard_tournament_id'] is None
    assert not [w for w in pkg.warnings if 'adboard' in w]  # (SMALL_TEAM's own broken files warn, by design)


def test_adboards_on_their_own_and_without_them(src):
    assert list(src.all_adboards) == ['adboard_3_0', f'specificadboard_0_{fakegame.LEAGUE}_0_0',
                                      f'specificadboard_{fakegame.TEAM}_0_0_1', f'specificadboard_{fakegame.TEAM}_{fakegame.LEAGUE}_0_0']
    pkg = package.build(src, Selection(teams={fakegame.TEAM: TeamPick([])},
                                       adboards=['adboard_3_0', f'specificadboard_{fakegame.TEAM}_0_0_1', 'nope']),
                        Options(include_adboards=False, include_originals=False))
    m = pkg.manifest
    assert m['includes_adboards'] is False and m['teams'][0]['adboards'] == []  # the team's ones stay out
    game, own = m['adboards']
    assert (game['name'], game['kind'], game['number'], game['group']) == ('adboard_3_0', 'game', 3, 0)
    assert (own['kind'], own['team'], own['tournament'], own['variant']) == ('specific', fakegame.TEAM, 0, 1)
    assert game['image'] == 'adboards/adboard_3_0.png' and game['image'] in pkg.files and 'original' not in game
    assert 'adboard nope: not in the game' in pkg.warnings
