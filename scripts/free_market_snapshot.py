import json, os
from datetime import datetime, timezone
import requests

UA = {'User-Agent': 'Mozilla/5.0 (NIFTY Intelligence Terminal; research)'}
OUT = 'data/market_snapshot.json'

def yahoo_chart(symbol, interval='5m', range_='1d'):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
    r = requests.get(url, params={'interval': interval, 'range': range_}, headers=UA, timeout=15)
    r.raise_for_status()
    result = r.json()['chart']['result']
    if not result:
        raise RuntimeError(f'No chart result for {symbol}')
    return result[0]

def rsi(closes, n=14):
    if len(closes) <= n:
        return None
    gains, losses = [], []
    for a, b in zip(closes[-n-1:-1], closes[-n:]):
        d = b - a
        gains.append(max(d, 0)); losses.append(max(-d, 0))
    ag, al = sum(gains) / n, sum(losses) / n
    return round(100 if al == 0 else 100 - (100 / (1 + ag / al)), 2)

def read_symbol(symbol):
    d = yahoo_chart(symbol)
    q = d['indicators']['quote'][0]
    closes = [x for x in q.get('close', []) if x is not None]
    volumes = [x for x in q.get('volume', []) if x is not None]
    price = closes[-1] if closes else None
    previous = closes[-2] if len(closes) > 1 else None
    change_pct = round(((price - previous) / previous) * 100, 2) if price is not None and previous else None
    return {'price': price, 'change_pct': change_pct, 'rsi14': rsi(closes), 'volume': volumes[-1] if volumes else None}

def snapshot():
    now = datetime.now(timezone.utc).isoformat()
    symbols = {'NIFTY': '^NSEI', 'VIX': '^INDIAVIX', 'SPX': '^GSPC', 'NASDAQ': '^IXIC', 'USDINR': 'INR=X', 'CRUDE': 'CL=F', 'GOLD': 'GC=F'}
    result = {
        'generated_at': now, 'timestamp': now,
        'source_quality': 'PUBLIC_RESEARCH_FEEDS', 'live_broker_feed': False,
        'decision': 'NO TRADE',
        'reason': 'No licensed real-time derivatives/options feed is connected; free public data must not be represented as exchange-direct live data.',
        'nifty': None, 'vix': None, 'regime': 'UNKNOWN', 'market': {},
        'contract': None, 'plan': None, 'pnl': None
    }
    for name, symbol in symbols.items():
        try:
            result['market'][name] = read_symbol(symbol)
        except Exception as exc:
            result['market'][name] = {'error': type(exc).__name__}
    nifty = result['market'].get('NIFTY', {})
    vix = result['market'].get('VIX', {})
    result['nifty'] = nifty.get('price'); result['vix'] = vix.get('price')
    rsi14 = nifty.get('rsi14')
    if rsi14 is not None:
        result['regime'] = 'DOWN' if rsi14 < 45 else ('UP' if rsi14 > 55 else 'NEUTRAL')
    os.makedirs('data', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

if __name__ == '__main__': snapshot()
