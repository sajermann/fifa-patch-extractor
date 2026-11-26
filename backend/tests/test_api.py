import json
import os
import zipfile

import fakegame
from conftest import wait


NO_GEAR = {'boots': 0, 'gloves': 0, 'balls': 0}
# what a full league of the fake game takes with it: the team's stadium, 3 board files (2 of the team, 1 of the
# league), the star's boot, the keepers' glove and the team's ball
WITH_LEAGUE = {'stadiums': 1, 'adboards': 3, 'boots': 1, 'gloves': 1, 'balls': 1}

def test_status(client):
    s = client.get('/api/status').json()
    assert s['source']['state'] == 'ready'
    assert s['source']['counts'] == {'leagues': 2, 'teams': 2, 'players': 21, 'nations': 2, 'stadiums': 1, 'adboards': 4,
                                         'boots': 2, 'gloves': 1, 'balls': 1}
    assert s['source']['suspect_birthdates']


def test_source_errors(client, tmp_path):
    r = client.post('/api/source', json={'path': str(tmp_path / 'nothing')})
    assert r.status_code == 400 and r.json()['detail']['code'] == 'folder_not_found'


def test_lists_page_filter_sort(client):
    r = client.get('/api/players', params={'size': 25}).json()
    assert r['total'] == 21 and len(r['items']) == 21 and r['sort'] == 'overall' and r['dir'] == 'desc'
    assert r['items'][0]['id'] == fakegame.STAR
    r = client.get('/api/players', params={'q': 'STAR plaYer', 'size': 25}).json()  # every word, no accents, any case
    assert [p['id'] for p in r['items']] == [fakegame.STAR]
    r = client.get('/api/players', params={'team': fakegame.SMALL_TEAM, 'sort': 'name', 'dir': 'asc'}).json()
    assert r['total'] == 6
    r = client.get('/api/players', params={'position': 0}).json()
    assert {p['id'] for p in r['items']} >= {fakegame.KEEPER, fakegame.BACKUP_KEEPER}
    r = client.get('/api/players', params={'face': 'yes'}).json()
    assert [p['id'] for p in r['items']] == [fakegame.STAR]
    r = client.get('/api/players', params={'min_overall': 90}).json()
    assert all(p['overall'] >= 90 for p in r['items'])
    r = client.get('/api/players', params={'size': 25, 'page': 9}).json()
    assert r['page'] == 1  # clamped to the last page
    r = client.get('/api/teams', params={'league': fakegame.LEAGUE}).json()
    assert [t['id'] for t in r['items']] == [fakegame.TEAM] and r['items'][0]['kit_count'] == 3
    assert r['items'][0]['colors'] == [[200, 10, 20], [250, 250, 250]]  # the colors the database has
    r = client.get('/api/teams', params={'national': 'yes'}).json()
    assert r['items'] == []
    r = client.get('/api/leagues', params={'q': 'nowhere'}).json()
    assert [x['id'] for x in r['items']] == [fakegame.LEAGUE]
    opts = client.get('/api/options').json()
    assert {n['id'] for n in opts['nations']} == {54, 52} and opts['positions'][0]['name'] == 'GK'


def test_details(client):
    t = client.get(f'/api/teams/{fakegame.TEAM}').json()
    assert t['names']['abbr3'] == 'TAT' and len(t['roster']) == 16 and t['captain']['id'] == fakegame.STAR
    assert [k['role'] for k in t['kits']] == ['home', 'away', 'goalkeeper']
    assert t['formation']['name'] == '4-4-2' and len(t['formation']['positions']) == 11
    assert t['club'] == {} and t['rival'] is None  # the fake teams have no club columns
    p = client.get(f'/api/players/{fakegame.STAR}').json()
    assert p['names']['last'] == 'Plàyer' and len(p['face_files']) == 5 and p['raw']['playerid'] == fakegame.STAR
    assert p['traits'] == ['leadership', 'finesse_shot', 'one_club_player'] and len(p['all_traits']) == 41
    # the Accessories tab: his boot (and no glove), not in the empty basket
    assert p['boot'] == {'code': fakegame.GAME_BOOT, 'name': 'B01'} and p['glove'] is None
    assert p['basket_parts'] == {'boot': 'none', 'glove': None}
    keeper = client.get(f'/api/players/{fakegame.KEEPER}').json()
    assert keeper['glove']['code'] == fakegame.GAME_GLOVE and keeper['boot'] is None
    lg = client.get(f'/api/leagues/{fakegame.LEAGUE}').json()
    assert lg['images'] == ['logo', 'banner'] and lg['teams'][0]['id'] == fakegame.TEAM
    assert lg['language_names']['full'] == {'eng_us': 'Test Premier Division of Nowhere'}
    assert lg['language_names']['abbr'] == {'eng_us': 'TST 1'} and lg['name_keys'][0] == 'full'
    assert lg['country_row']['id'] == 54 and lg['country_row']['name'] == 'Republic of Nowhere'
    assert client.get('/api/players/1').status_code == 404


def test_images(client):
    for url in (f'/api/image/crest/{fakegame.TEAM}?nobg=true&size=32', f'/api/image/photo/{fakegame.STAR}',
                f'/api/image/league/{fakegame.LEAGUE}/logo', f'/api/image/kit/{fakegame.TEAM}/1/jersey?size=32'):
        r = client.get(url)
        assert r.status_code == 200 and r.content[:4] == b'\x89PNG', url
    assert client.get(f'/api/image/crest/{fakegame.SMALL_TEAM}').status_code == 422  # broken file
    assert client.get(f'/api/image/photo/{fakegame.KEEPER}').status_code == 404


def test_basket(client):
    def op(name, **args):
        r = client.post('/api/basket', json={'op': name, 'args': args})
        assert r.status_code == 200, r.text
        return r.json()
    assert op('add_league', id=fakegame.LEAGUE) == {'nations': 0, 'leagues': 1, 'teams': 1, 'players': 16, **WITH_LEAGUE}
    assert op('set_team', id=fakegame.TEAM, players=[fakegame.STAR, fakegame.KEEPER])['players'] == 2
    assert op('add_players', ids=[fakegame.SHARED, fakegame.STAR])['players'] == 3  # STAR already inside
    rows = client.get('/api/players', params={'in_basket': 'yes'}).json()['items']
    assert {p['id'] for p in rows} == {fakegame.STAR, fakegame.KEEPER, fakegame.SHARED}
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=True)['players'] == 4
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=False)['players'] == 3
    assert op('remove_players', ids=[fakegame.STAR])['players'] == 2
    view = client.get('/api/basket').json()
    assert view['teams'][0]['players'] == 1 and view['players'][0]['id'] == fakegame.SHARED
    assert op('remove_league', id=fakegame.LEAGUE) == {'nations': 0, 'leagues': 0, 'teams': 0, 'players': 1, 'stadiums': 0, 'adboards': 0, **NO_GEAR}
    assert client.post('/api/basket', json={'op': 'nope'}).status_code == 400


def test_nations(client):
    r = client.get('/api/nations', params={'leagues': 'yes'}).json()
    assert r['total'] == 2 and r['sort'] == 'name'
    r = client.get('/api/nations', params={'q': 'republic'}).json()  # the name of the language database
    row, = r['items']
    assert row['id'] == 54 and row['name'] == 'Republic of Nowhere' and row['database_name'] == 'Nowhereland'
    assert row['abbr3'] == 'NWH' and row['league_count'] == 1 and row['player_count'] == 21
    n = client.get('/api/nations/54').json()
    assert [lg['id'] for lg in n['leagues']] == [fakegame.LEAGUE] and n['audio']['chantregionindex'] == 7
    assert n['language_names'] == {'full': {'eng_us': 'Republic of Nowhere'}, 'abbr3': {'eng_us': 'NWH'}}
    assert n['name_keys'] == ['full', 'abbr3']
    assert [f['path'] for f in n['flag_files']] == ['data/ui/imgassets/flags512x512/f_54.dds',
                                                    'data/ui/artassets/countryflags/f_54.big']
    assert client.get('/api/nations/1').status_code == 404

    def op(name, **args):
        return client.post('/api/basket', json={'op': name, 'args': args}).json()
    assert op('add_nation', id=54) == {'nations': 1, 'leagues': 1, 'teams': 1, 'players': 16, **WITH_LEAGUE}  # leagues and teams
    assert client.get('/api/basket').json()['nations'] == [{'id': 54, 'name': 'Republic of Nowhere'}]
    assert op('remove_nation', id=54) == {'nations': 0, 'leagues': 0, 'teams': 0, 'players': 0, 'stadiums': 0, 'adboards': 0, **NO_GEAR}


def test_team_stadium(client):
    t = client.get(f'/api/teams/{fakegame.TEAM}').json()
    assert t['language_names']['full'] == {'eng_us': 'Test Athletic Club'} and t['name_keys'][0] == 'full'
    assert set(t['ratings']) == {'attack', 'midfield', 'defense'}
    assert [lg['id'] for lg in t['league_rows']] == [fakegame.LEAGUE]
    stadium, = t['stadiums']
    assert stadium['id'] == fakegame.STADIUM and stadium['name'] == 'Test Ground' and stadium['capacity'] == 12345
    assert stadium['home_team']['id'] == fakegame.TEAM and stadium['country'] == 'Republic of Nowhere'
    assert stadium['pictures'] == [1, 3] and len(stadium['files']) == len(fakegame.STADIUM_FILES)
    assert t['stadium_custom_name'] == 'Custom Park'
    r = client.get(f'/api/image/stadium/{fakegame.STADIUM}/1')
    assert r.status_code == 200 and r.content[:4] == b'\x89PNG'
    assert client.get(f'/api/image/stadium/{fakegame.STADIUM}/2').status_code == 404
    assert client.get(f'/api/teams/{fakegame.SMALL_TEAM}').json()['stadiums'] == []
    assert stadium['times'] == [1]
    r = client.get(f'/api/preview/stadium/{fakegame.STADIUM}.glb')
    assert r.status_code == 200 and r.content[:4] == b'glTF'
    assert client.get(f'/api/preview/stadium/{fakegame.STADIUM}.glb', params={'tod': 3}).status_code == 404
    assert client.get(f'/api/preview/stadium/{fakegame.STADIUM}.glb', params={'tod': 2}).status_code == 404


def test_stadiums(client):
    r = client.get('/api/stadiums', params={'q': 'custom park'}).json()  # the name a team gives it is searched too
    row, = r['items']
    assert row['id'] == fakegame.STADIUM and row['name'] == 'Test Ground' and row['language_name'] == 'Test Arena'
    assert row['home_team_id'] == fakegame.TEAM and row['picture'] == 1 and row['has_3d'] is True
    assert client.get('/api/stadiums', params={'home': 'no'}).json()['total'] == 0
    d = client.get(f'/api/stadiums/{fakegame.STADIUM}').json()
    assert d['detail']['times'] == [1] and d['teams'][0]['stadium_custom_name'] == 'Custom Park'
    assert d['detail']['conditions'] == [{'time_of_day': 1, 'rain': True, 'snow': True},
                                         {'time_of_day': 3, 'rain': True, 'snow': False}]
    assert client.get('/api/stadiums/999').status_code == 404

    def op(name, **args):
        return client.post('/api/basket', json={'op': name, 'args': args}).json()
    assert op('add_stadium', id=fakegame.STADIUM)['stadiums'] == 1
    assert client.get('/api/stadiums', params={'in_basket': 'yes'}).json()['total'] == 1
    job = client.post('/api/export').json()  # a stadium alone is enough to export
    wait(lambda: client.get(f'/api/export/{job["id"]}').json()['state'] != 'running')
    ended = client.get(f'/api/export/{job["id"]}').json()
    result = ended['result']
    assert result['counts']['stadiums'] == 1 and result['counts']['teams'] == 0
    assert ended['step'] == 'write' and ended['step_done'] == ended['step_total'] > 1  # the zip has its own step
    assert ended['done'] == ended['total'] == 2  # the stadium and its country
    assert ended['bytes_done'] == ended['bytes_total'] > 0 and ended['elapsed'] >= 0 and ended['workers'] >= 1
    client.delete(f'/api/exports/{result["name"]}')
    assert op('remove_stadium', id=fakegame.STADIUM)['stadiums'] == 0


def test_preview(client):
    look = client.get(f'/api/preview/look/{fakegame.STAR}').json()
    assert look['real'] is True and look['head'] == fakegame.STAR  # his own face files
    assert look['generic_in_game'] is True  # his row does not ask the game for them (no headclasscode 0)
    keeper = client.get(f'/api/preview/look/{fakegame.KEEPER}').json()  # a head file alone is no real face
    assert keeper['real'] is False and keeper['head'] == 2500 + fakegame.KEEPER % 7
    assert client.get('/api/preview/look/1').json()['head'] == 1  # unknown player = the model player
    r = client.get(f'/api/preview/kit-print/{fakegame.TEAM}/0.png', params={'number': 10, 'name': 'Starman'})
    assert r.status_code == 200 and r.content[:4] == b'\x89PNG'
    assert client.get(f'/api/preview/kit-print/{fakegame.TEAM}/9.png').status_code == 404  # no such kit
    assert client.get('/api/preview/mesh/jersey/0.glb').status_code == 404  # no body models in the fake game
    assert client.get('/api/preview/mesh/nope/0.glb').status_code == 404
    t = client.get(f'/api/teams/{fakegame.TEAM}').json()
    star = next(r for r in t['roster'] if r['id'] == fakegame.STAR)
    assert star['back_name'] == 'PLÀYER'


def test_selections(client):
    client.post('/api/basket', json={'op': 'add_team', 'args': {'id': fakegame.SMALL_TEAM}})
    s = client.post('/api/selections', json={'name': 'Mine'}).json()
    assert s['teams'] == 1 and s['players'] == 6
    client.post('/api/basket', json={'op': 'clear'})
    assert client.post(f'/api/selections/{s["id"]}/load').json()['players'] == 6
    assert client.post('/api/selections', json={'name': ' mine '}).json()['id'] == s['id']  # same name = update
    assert client.delete(f'/api/selections/{s["id"]}').status_code == 200
    assert client.get('/api/selections').json() == []


def test_export(client):
    assert client.post('/api/export').json()['detail']['code'] == 'basket_empty'
    client.post('/api/basket', json={'op': 'add_league', 'args': {'id': fakegame.LEAGUE}})
    client.post('/api/basket', json={'op': 'set_form', 'args': {'patch_name': 'My Patch!', 'credits_url': 'bad link'}})
    assert client.post('/api/export').json()['detail']['code'] == 'invalid_link'
    client.post('/api/basket', json={'op': 'set_form', 'args': {'credits_url': 'example.com'}})
    job = client.post('/api/export').json()
    wait(lambda: client.get(f'/api/export/{job["id"]}').json()['state'] != 'running')
    job = client.get(f'/api/export/{job["id"]}').json()
    assert job['state'] == 'done', job['error']
    result = job['result']
    assert result['name'].startswith('My-Patch-') and result['counts']['players'] == 16
    assert result['counts']['stadiums'] == 1  # the team's stadium goes by default
    listed = client.get('/api/exports').json()
    assert listed[0]['name'] == result['name']
    r = client.get(f'/api/exports/{result["name"]}')
    assert r.status_code == 200
    path = os.path.join(os.environ['FPX_DATA_DIR'], 'exports', result['name'])
    with zipfile.ZipFile(path) as z:
        m = json.loads(z.read('package.json'))
    assert m['source']['patch_name'] == 'My Patch!' and m['credits']['url'] == 'https://example.com'
    assert client.get('/api/exports/..%2Fconfig.json').status_code == 404
    assert client.delete(f'/api/exports/{result["name"]}').status_code == 200


def test_adboards(client):
    r = client.get('/api/adboards').json()
    assert [b['id'] for b in r['items']] == ['adboard_3_0', f'specificadboard_0_{fakegame.LEAGUE}_0_0',
                                             f'specificadboard_{fakegame.TEAM}_0_0_1', f'specificadboard_{fakegame.TEAM}_{fakegame.LEAGUE}_0_0']
    own = client.get('/api/adboards', params={'kind': 'specific', 'q': 'test athletic'}).json()['items']
    assert {b['team_id'] for b in own} == {fakegame.TEAM} and len(own) == 2  # searched by the team's name
    league = next(b for b in r['items'] if b['tournament'] == fakegame.LEAGUE and b['team_id'] is None)
    assert league['league'] and league['variant'] == 0
    img = client.get('/api/image/adboard/adboard_3_0', params={'size': 32})
    assert img.status_code == 200 and img.headers['content-type'] == 'image/png'
    assert client.get('/api/image/adboard/nope').status_code == 404

    def op(name, **args):
        return client.post('/api/basket', json={'op': name, 'args': args}).json()
    assert op('add_adboard', id='adboard_3_0')['adboards'] == 1
    assert client.get('/api/adboards', params={'in_basket': 'yes'}).json()['total'] == 1
    assert client.get('/api/basket').json()['adboards'] == [{'id': 'adboard_3_0', 'name': 'adboard_3_0'}]
    client.post('/api/basket', json={'op': 'set_form', 'args': {'include_adboards': False}})
    job = client.post('/api/export').json()  # a board alone is enough to export
    wait(lambda: client.get(f'/api/export/{job["id"]}').json()['state'] != 'running')
    result = client.get(f'/api/export/{job["id"]}').json()['result']
    assert result['counts']['adboards'] == 1 and result['counts']['teams'] == 0
    path = os.path.join(os.environ['FPX_DATA_DIR'], 'exports', result['name'])
    with zipfile.ZipFile(path) as z:
        m = json.loads(z.read('package.json'))
    assert m['includes_adboards'] is False and m['adboards'][0]['name'] == 'adboard_3_0'
    client.delete(f'/api/exports/{result["name"]}')
    client.post('/api/basket', json={'op': 'set_form', 'args': {'include_adboards': True}})
    assert op('remove_adboard', id='adboard_3_0')['adboards'] == 0


def test_equipment_pictures_saved_on_disk(tmp_path, monkeypatch):
    """A drawn picture is kept on disk by its files' content: the second time it is not drawn again."""
    from fpxapi import main
    monkeypatch.setattr(main, 'DRAWN_DIR', str(tmp_path))
    calls = []

    def draw():
        calls.append(1)
        return b'PNG'
    assert main._drawn_on_disk('boot|1|128|a|b', draw) == b'PNG'
    assert main._drawn_on_disk('boot|1|128|a|b', draw) == b'PNG' and len(calls) == 1
    assert main._drawn_on_disk('boot|1|128|a|changed', draw) == b'PNG' and len(calls) == 2
    assert main._drawn_on_disk('ball|2|128|a|b', lambda: None) is None  # cannot be drawn: remembered as such
    assert main._drawn_on_disk('ball|2|128|a|b', draw) is None and len(calls) == 2


def test_lists_show_what_goes_with_a_team(client):
    """A team of the basket takes its boards, stadium and ball: their lists show them as going with it."""
    team_name = client.get(f'/api/teams/{fakegame.TEAM}').json()['name']
    client.post('/api/basket', json={'op': 'add_team', 'args': {'id': fakegame.TEAM}})
    boards = {b['id']: b for b in client.get('/api/adboards').json()['items']}
    mine = boards[f'specificadboard_{fakegame.TEAM}_0_0_1']
    assert mine['in_basket'] is False and mine['basket_via'] == {'names': [team_name], 'total': 1}
    assert boards['adboard_3_0']['basket_via'] is None
    assert client.get('/api/adboards', params={'in_basket': 'yes'}).json()['total'] == 2
    stadium = client.get('/api/stadiums', params={'q': 'custom park'}).json()['items'][0]
    assert stadium['basket_via']['names'] == [team_name]
    ball = client.get('/api/equipment/balls').json()['items'][0]
    assert ball['basket_via']['names'] == [team_name]
    boots = client.get('/api/equipment/boots').json()['items']  # a boot goes with the players that wear it
    boot = next(b for b in boots if b['id'] == fakegame.GAME_BOOT)
    assert boot['basket_via']['total'] >= 1 and all(n and not n.startswith('#') for n in boot['basket_via']['names'])
    # a part left out of the team does not go with it
    client.post('/api/basket', json={'op': 'tree', 'args': {'key': f'adboards:{fakegame.TEAM}', 'mode': 'none'}})
    assert client.get('/api/adboards', params={'in_basket': 'yes'}).json()['total'] == 0
    client.post('/api/basket', json={'op': 'clear'})


def test_equipment(client):
    boots = client.get('/api/equipment/boots').json()
    assert [b['id'] for b in boots['items']] == [fakegame.GAME_BOOT, fakegame.GAME_BOOT * 10 + 1]
    boot = boots['items'][0]
    assert (boot['name'], boot['wearers'], boot['listed'], boot['files'], boot['in_basket']) == ('B01', 1, True, 2, False)
    assert client.get('/api/equipment/boots', params={'q': 'b01'}).json()['total'] == 1
    assert client.get('/api/equipment/boots', params={'used': 'no'}).json()['total'] == 1
    assert client.get('/api/equipment/gloves').json()['items'][0]['name'] == 'G01'
    assert client.get('/api/equipment/hats').status_code == 404
    assert client.get('/api/status').json()['source']['counts']['balls'] == 1
    # the fake game's meshes are not real meshes: no picture (the screen shows its placeholder)
    assert client.get(f'/api/image/equipment/boots/{fakegame.GAME_BOOT}').status_code == 404

    def op(name, **args):
        return client.post('/api/basket', json={'op': name, 'args': args})
    assert op('add_equipment', kind='balls', id=fakegame.GAME_BALL).json()['balls'] == 1
    assert op('add_equipment', kind='hats', id=1).status_code == 400
    assert client.get('/api/equipment/balls', params={'in_basket': 'yes'}).json()['total'] == 1
    assert client.get('/api/basket').json()['balls'] == [{'id': fakegame.GAME_BALL, 'found': True, 'name': 'L01'}]
    job = client.post('/api/export').json()  # a ball alone is enough to export
    wait(lambda: client.get(f'/api/export/{job["id"]}').json()['state'] != 'running')
    result = client.get(f'/api/export/{job["id"]}').json()['result']
    assert result['counts']['balls'] == 1 and result['counts']['teams'] == 0
    path = os.path.join(os.environ['FPX_DATA_DIR'], 'exports', result['name'])
    with zipfile.ZipFile(path) as z:
        m = json.loads(z.read('package.json'))
    assert m['balls'][0]['source_id'] == fakegame.GAME_BALL and m['boots'] == []
    client.delete(f'/api/exports/{result["name"]}')
    assert op('remove_equipment', kind='balls', id=fakegame.GAME_BALL).json()['balls'] == 0


def test_selection_tree(client):
    def op(name, **args):
        r = client.post('/api/basket', json={'op': name, 'args': args})
        assert r.status_code == 200, r.text
        return r.json()

    def node(key):
        return client.get('/api/tree', params={'key': key, 'inside': True}).json()

    def row(kind, rid):
        return next(r for r in client.get(f'/api/{kind}', params={'size': 100}).json()['items'] if r['id'] == rid)

    # a country with everything inside, then the country alone
    counts = op('tree', key='nation:54', mode='all')
    assert (counts['nations'], counts['leagues'], counts['teams'], counts['players']) == (1, 1, 1, 16)
    n = node('nation:54')
    assert n['node']['state'] == 'full' and n['node']['inside'] == {'leagues': 1, 'teams': 1, 'players': 16}
    assert row('nations', 54)['basket_state'] == 'full' and row('nations', 54)['basket_count'] == {'on': 1, 'total': 1}
    counts = op('tree', key='nation:54', mode='only')
    assert (counts['nations'], counts['leagues'], counts['teams'], counts['players']) == (1, 0, 0, 0)
    assert row('nations', 54)['basket_state'] == 'only'

    # inside a team: its parts and players; a boot left out of the star, the ball left out of the team
    op('tree', key=f'league:{fakegame.LEAGUE}', mode='all')
    assert node('nation:54')['node']['state'] == 'full'
    t = node(f'team:{fakegame.TEAM}')
    assert [c['kind'] for c in t['children'][:3]] == ['stadium', 'ball', 'adboards'] and len(t['children']) == 19
    star = f'player:{fakegame.TEAM}:{fakegame.STAR}'
    assert [c['key'] for c in node(star)['children']] == [f'boot:{fakegame.TEAM}:{fakegame.STAR}']
    op('tree', key=f'boot:{fakegame.TEAM}:{fakegame.STAR}', mode='none')
    op('tree', key=f'ball:{fakegame.TEAM}', mode='none')
    assert node(star)['node']['state'] == 'only' and node(f'team:{fakegame.TEAM}')['node']['state'] == 'part'
    assert row('nations', 54)['basket_state'] == 'part'
    assert row('players', fakegame.STAR)['basket_key'] == star

    # a player picked in a team out of the basket brings the team alone (no parts, no other player)
    op('tree', key=f'player:{fakegame.SMALL_TEAM}:8101', mode='all')
    small = node(f'team:{fakegame.SMALL_TEAM}')
    assert small['node']['state'] == 'part' and small['node']['inside']['players'] == 1

    # the whole tree: the two countries
    root = node('root')
    assert [c['key'] for c in root['children']] == ['nation:54', 'nation:52']

    job = client.post('/api/export').json()
    wait(lambda: client.get(f'/api/export/{job["id"]}').json()['state'] != 'running')
    counts = client.get(f'/api/export/{job["id"]}').json()['result']['counts']
    assert (counts['boots'], counts['balls'], counts['gloves'], counts['stadiums']) == (0, 0, 1, 1)

    # "select all": the ids of every row that passes the filters, then many nodes at once
    ids = client.get('/api/players', params={'team': fakegame.SMALL_TEAM, 'ids_only': True}).json()['ids']
    assert sorted(ids) == sorted(fakegame.SMALL_TEAM_PLAYERS)
    op('tree_many', keys=[f'player:0:{i}' for i in ids], mode='all')
    assert [c['key'] for c in node('root')['children']][-1] == 'group:players'
    op('tree', key='root', mode='none')
    assert client.get('/api/basket').json()['counts']['players'] == 0
    assert client.post('/api/basket', json={'op': 'tree', 'args': {'key': 'team:x', 'mode': 'all'}}).status_code == 400


def test_old_basket_switches(tmp_path):
    from fpxapi.state import Basket
    path = tmp_path / 'basket.json'
    path.write_text(json.dumps({'leagues': [9001], 'teams': {'7001': {'players': [8001]}},
                                'form': {'include_stadiums': False, 'include_equipment': False}}))
    b = Basket(str(path))
    assert b.data['off'] == {'team:7001': ['stadium', 'ball'], 'player:8001': ['boot', 'glove']}
    assert b.data['form']['include_stadiums'] is True and b.data['form']['include_adboards'] is True
    sel = b.selection()
    assert sel.teams[7001].stadium is False and sel.teams[7001].adboards is True and sel.no_gear == {8001: ['boot', 'glove']}


def test_team_and_league_parts(client):
    t = client.get(f'/api/teams/{fakegame.TEAM}').json()
    assert t['basket_parts'] == {'stadium': 'none', 'ball': 'none', 'adboards': 'none'}  # not in the basket yet
    assert len(t['adboards']) == 2 and t['ball']['code'] > 0
    client.post('/api/basket', json={'op': 'tree', 'args': {'key': f'team:{fakegame.TEAM}', 'mode': 'all'}})
    client.post('/api/basket', json={'op': 'tree', 'args': {'key': f'stadium:{fakegame.TEAM}', 'mode': 'none'}})
    t = client.get(f'/api/teams/{fakegame.TEAM}').json()
    assert t['basket_parts'] == {'stadium': 'none', 'ball': 'full', 'adboards': 'full'}
    assert client.get(f'/api/teams/{fakegame.SMALL_TEAM}').json()['basket_parts']['stadium'] is None  # has none
    lg = client.get(f'/api/leagues/{fakegame.LEAGUE}').json()
    assert [b['name'] for b in lg['adboards']] == [f'specificadboard_0_{fakegame.LEAGUE}_0_0'] and lg['basket_boards'] == 'none'
    client.post('/api/basket', json={'op': 'tree', 'args': {'key': f'league:{fakegame.LEAGUE}', 'mode': 'all'}})
    assert client.get(f'/api/leagues/{fakegame.LEAGUE}').json()['basket_boards'] == 'full'


def test_export_settings_stay_in_range(client):
    machine = client.get('/api/machine').json()
    assert {'cores', 'memory_mb', 'default_cores', 'workers'} <= set(machine)
    cfg = client.put('/api/settings', json={'export_cores': 10_000, 'export_memory_percent': 1}).json()
    assert cfg['export_cores'] == (machine['cores'] or 1) and cfg['export_memory_percent'] == 10
    cfg = client.put('/api/settings', json={'export_cores': None, 'export_memory_percent': None}).json()
    assert cfg['export_cores'] is None and cfg['export_memory_percent'] is None
