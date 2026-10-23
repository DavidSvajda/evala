"""Authenticated smoke test of the deployed engine; never prints the API token."""
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

private = Path(__file__).resolve().parent.parent / '.local-data' / 'deployment'
receipt = json.loads((private / 'deployment.json').read_text())
token = (private / 'api-token.txt').read_text().strip()
base = receipt['url']


def request(path, data=None, authenticated=True):
    headers = {'Authorization': 'Bearer ' + token} if authenticated else {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
    return urllib.request.urlopen(req, timeout=90)


start = time.monotonic()
with request('/api/health') as response:
    health = json.load(response)
assert health['ok'] and health['slots'] == 1
print('PASS: authenticated server health, one engine slot; first request %.1fs' % (time.monotonic() - start))
try:
    request('/api/analyze', {'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}, authenticated=False)
    raise AssertionError('Unauthenticated API request was accepted')
except urllib.error.HTTPError as error:
    assert error.code == 401
with request('/', authenticated=False) as response:
    html = response.read()
    assert b'<meta name="evala-backend" content="server">' in html
    assert b'id="view-analytics"' in html and b'id="analytics-workspace"' in html
    assert b'<meta name="evala-public" content="true">' in html
with request('/api/session', authenticated=False) as response:
    assert json.load(response)['publicReports']
    cookie = response.headers['Set-Cookie'].split(';')[0]
pgn = '[Event "Public smoke"]\n[White "Guest"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'
req = urllib.request.Request(base + '/api/review-game', data=json.dumps({'pgn': pgn, 'profile': 'quick'}).encode(), headers={'Cookie': cookie, 'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=90) as response:
    records = [json.loads(line) for line in response if line.strip()]
assert next(item['game'] for item in records if item['type'] == 'game')['analysis']['complete']
print('PASS: public session without owner token and complete server game review')
extension_origin = 'chrome-extension://' + 'a' * 32
req = urllib.request.Request(base + '/api/health', headers={
    'Origin': extension_origin, 'Authorization': 'Bearer ' + token})
with urllib.request.urlopen(req, timeout=90) as response:
    assert response.headers['Access-Control-Allow-Origin'] == extension_origin
req = urllib.request.Request(base + '/api/analyze', method='OPTIONS', headers={
    'Origin': extension_origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type'})
with urllib.request.urlopen(req, timeout=90) as response:
    assert response.status == 204
print('PASS: authenticated extension origin and CORS preflight')
fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
start = time.monotonic()
with request('/api/analyze', {'fen': fen, 'settings': {'time': 1000, 'depth': 18, 'multipv': 3}}) as response:
    records = [json.loads(line) for line in response if line.strip()]
result = next(item['result'] for item in records if item['type'] == 'done')
assert len(result['lines']) == 3 and result['depth'] >= 6
assert all(line['pv'] for line in result['lines'])
print(json.dumps({'status': 'PASS', 'engine': health['engine'], 'variants': len(result['lines']),
                  'depth': result['depth'], 'nodesPerSecond': result['nps'],
                  'requestSeconds': round(time.monotonic() - start, 2)}))
