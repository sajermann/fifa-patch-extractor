import json
import os
import zipfile

import fakegame
from conftest import wait


def test_status(client):
    s = client.get('/api/status').json()
    assert s['source']['state'] == 'ready'
    assert s['source']['counts'] == {'leagues': 2, 'teams': 2, 'players': 21, 'nations': 2}
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
    p = client.get(f'/api/players/{fakegame.STAR}').json()
    assert p['names']['last'] == 'Plàyer' and len(p['face_files']) == 4 and p['raw']['playerid'] == fakegame.STAR
    lg = client.get(f'/api/leagues/{fakegame.LEAGUE}').json()
    assert lg['images'] == ['logo', 'banner'] and lg['teams'][0]['id'] == fakegame.TEAM
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
    assert op('add_league', id=fakegame.LEAGUE) == {'leagues': 1, 'teams': 1, 'players': 16}
    assert op('set_team', id=fakegame.TEAM, players=[fakegame.STAR, fakegame.KEEPER])['players'] == 2
    assert op('add_players', ids=[fakegame.SHARED, fakegame.STAR])['players'] == 3  # STAR already inside
    rows = client.get('/api/players', params={'in_basket': 'yes'}).json()['items']
    assert {p['id'] for p in rows} == {fakegame.STAR, fakegame.KEEPER, fakegame.SHARED}
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=True)['players'] == 4
    assert op('pick', team=fakegame.TEAM, player=fakegame.BACKUP_KEEPER, on=False)['players'] == 3
    assert op('remove_players', ids=[fakegame.STAR])['players'] == 2
    view = client.get('/api/basket').json()
    assert view['teams'][0]['players'] == 1 and view['players'][0]['id'] == fakegame.SHARED
    assert op('remove_league', id=fakegame.LEAGUE) == {'leagues': 0, 'teams': 0, 'players': 1}
    assert client.post('/api/basket', json={'op': 'nope'}).status_code == 400


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
