"""Create a bounded, rating-stratified CC0 puzzle bank from Lichess's official export."""
import csv
import io
import json
from pathlib import Path
import urllib.request
import zstandard

URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
ROOT = Path(__file__).resolve().parent.parent
buckets = {}
seen = 0
with urllib.request.urlopen(URL, timeout=90) as response:
    with zstandard.ZstdDecompressor().stream_reader(response) as reader:
        rows = csv.DictReader(io.TextIOWrapper(reader, encoding='utf8'))
        for row in rows:
            seen += 1
            rating = int(row['Rating'])
            if int(row['Popularity']) < 80 or int(row['NbPlays']) < 100 or int(row['RatingDeviation']) > 100:
                continue
            if not 400 <= rating <= 3000:
                continue
            bucket = rating // 100
            if len(buckets.get(bucket, [])) >= 180:
                continue
            moves = row['Moves'].split()
            if not 2 <= len(moves) <= 12:
                continue
            puzzle = {'id': row['PuzzleId'], 'fen': row['FEN'], 'moves': moves, 'rating': rating,
                      'themes': row['Themes'].split(), 'source': row['GameUrl']}
            buckets.setdefault(bucket, []).append(puzzle)
            if seen >= 180000 or sum(map(len, buckets.values())) >= 4500:
                break
out = ROOT / 'public' / 'data'
out.mkdir(parents=True, exist_ok=True)
puzzles = [p for key in sorted(buckets) for p in buckets[key]]
(out / 'puzzles.json').write_text(json.dumps({'version': 1, 'license': 'CC0-1.0', 'source': URL, 'puzzles': puzzles}, separators=(',', ':')), encoding='utf8')
print(json.dumps({'puzzles': len(puzzles), 'rowsRead': seen, 'lowest': min(p['rating'] for p in puzzles), 'highest': max(p['rating'] for p in puzzles)}))
