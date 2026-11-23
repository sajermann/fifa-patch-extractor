import json
import os
import zipfile

import fakegame
from conftest import wait


def test_status(client):
    s = client.get('/api/status').json()
    assert s['source']['state'] == 'ready'
    assert s['source']['counts'] == {'leagues': 2, 'teams': 2, 'players': 21, 'nations': 2, 'stadiums': 1}
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
    assert p['names']['last'] == 'Plàyer' and len(p['face_files']) == 4 and p['raw']['playerid'] == fakegame.STAR
    assert p['traits'] == ['leadership', 'finesse_shot', 'one_club_player'] and len(p['all_traits']) == 41
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
    assert op('add_league', id=fakegame.LEAGUE) == {'nations': 0, 'leagues': 1, 'teams': 1, 'players': 16, 'stadiums': 0}
    assert op('set_team', id=fakegame.TEAM, players=[fakegame.STAR, fakegame.KEEPER])['players'] == 2
    assert op('add_players', ids=[fakegame.SHARED, fakegame.STAR])['players'] == 3  # STAR already inside
    rows = client.get('/api/players', params={'in_basket': 'yes'}).json()['items']
    assert {p['id'] for p in rows} == {fakegame.STAR, fakegame.KEEPER, fakegame.SHARED}
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=True)['players'] == 4
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=False)['players'] == 3
    assert op('remove_players', ids=[fakegame.STAR])['players'] == 2
    view = client.get('/api/basket').json()
    assert view['teams'][0]['players'] == 1 and view['players'][0]['id'] == fakegame.SHARED
    assert op('remove_league', id=fakegame.LEAGUE) == {'nations': 0, 'leagues': 0, 'teams': 0, 'players': 1, 'stadiums': 0}
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
    assert op('add_nation', id=54) == {'nations': 1, 'leagues': 1, 'teams': 1, 'players': 16, 'stadiums': 0}  # leagues and teams
    assert client.get('/api/basket').json()['nations'] == [{'id': 54, 'name': 'Republic of Nowhere'}]
    assert op('remove_nation', id=54) == {'nations': 0, 'leagues': 0, 'teams': 0, 'players': 0, 'stadiums': 0}


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
    result = client.get(f'/api/export/{job["id"]}').json()['result']
    assert result['counts']['stadiums'] == 1 and result['counts']['teams'] == 0
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
