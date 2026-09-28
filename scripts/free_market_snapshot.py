import json, math, os
from datetime import datetime, timezone
import requests
import xml.etree.ElementTree as ET

UA = {'User-Agent': 'Mozilla/5.0 (NIFTY Intelligence Terminal; research)'}
OUT = 'data/market_snapshot.json'
HISTORY = 'data/history.json'


def yahoo_chart(symbol, interval='5m', range_='5d'):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
    r = requests.get(url, params={'interval': interval, 'range': range_}, headers=UA, timeout=15)
    r.raise_for_status()
    result = r.json().get('chart', {}).get('result') or []
    if not result:
        raise RuntimeError(f'No chart result for {symbol}')
    return result[0]


def clean_series(values):
    return [float(x) for x in values if x is not None]


def ema(values, n):
    if len(values) < n:
        return None
    k = 2 / (n + 1)
    e = sum(values[:n]) / n
    for x in values[n:]:
        e = x * k + e * (1 - k)
    return e


def rsi(values, n=14):
    if len(values) <= n:
        return None
    gains, losses = [], []
    for a, b in zip(values[-n-1:-1], values[-n:]):
        d = b - a
        gains.append(max(d, 0)); losses.append(max(-d, 0))
    ag, al = sum(gains) / n, sum(losses) / n
    return 100.0 if al == 0 else 100 - (100 / (1 + ag / al))


def atr(highs, lows, closes, n=14):
    if len(closes) <= n:
        return None
    trs = []
    for i in range(1, len(closes)):
        trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1])))
    return sum(trs[-n:]) / n


def vwap(highs, lows, closes, volumes):
    pv, vv = 0.0, 0.0
    for h, l, c, v in zip(highs, lows, closes, volumes):
        if v is None:
            continue
        tp = (h + l + c) / 3
        pv += tp * v; vv += v
    return pv / vv if vv else None


def read_symbol(symbol, range_='5d'):
    d = yahoo_chart(symbol, '5m', range_)
    q = d['indicators']['quote'][0]
    closes = clean_series(q.get('close', [])); highs = clean_series(q.get('high', [])); lows = clean_series(q.get('low', [])); volumes = clean_series(q.get('volume', []))
    price = closes[-1] if closes else None
    previous = closes[-2] if len(closes) > 1 else None
    change_pct = ((price - previous) / previous * 100) if price is not None and previous else None
    e20, e50 = ema(closes, 20), ema(closes, 50)
    r = rsi(closes)
    a = atr(highs, lows, closes)
    vw = vwap(highs[-78:], lows[-78:], closes[-78:], volumes[-78:]) if len(closes) >= 20 else None
    mom5 = ((price / closes[-6]) - 1) * 100 if len(closes) > 6 else None
    mom15 = ((price / closes[-16]) - 1) * 100 if len(closes) > 16 else None
    return {
        'price': round(price, 2) if price is not None else None,
        'change_pct': round(change_pct, 2) if change_pct is not None else None,
        'rsi14': round(r, 2) if r is not None else None,
        'ema20': round(e20, 2) if e20 is not None else None,
        'ema50': round(e50, 2) if e50 is not None else None,
        'atr14': round(a, 2) if a is not None else None,
        'vwap': round(vw, 2) if vw is not None else None,
        'momentum5m_pct': round(mom5, 2) if mom5 is not None else None,
        'momentum15m_pct': round(mom15, 2) if mom15 is not None else None,
        'volume': int(volumes[-1]) if volumes else None,
        'high_5d': round(max(highs), 2) if highs else None,
        'low_5d': round(min(lows), 2) if lows else None,
    }


def fetch_news():
    queries = ['NIFTY India markets RBI Fed', 'India stock market NIFTY options', 'India inflation RBI interest rates']
    out = []
    for q in queries:
        try:
            r = requests.get('https://news.google.com/rss/search', params={'q': q, 'hl': 'en-IN', 'gl': 'IN', 'ceid': 'IN:en'}, headers=UA, timeout=10)
            root = ET.fromstring(r.text)
            for item in root.findall('./channel/item')[:4]:
                title = item.findtext('title')
                pub = item.findtext('pubDate')
                if title:
                    out.append({'title': title, 'published': pub})
        except Exception:
            continue
    seen = set(); unique = []
    for x in out:
        if x['title'] not in seen:
            seen.add(x['title']); unique.append(x)
    return unique[:10]


def score_market(m):
    n = m.get('NIFTY', {})
    v = m.get('VIX', {})
    score = 0.0; reasons = []
    if n.get('price') is None: return 0.0, ['NIFTY price unavailable']
    if n.get('ema20') and n.get('ema50'):
        if n['price'] > n['ema20'] > n['ema50']:
            score += 2; reasons.append('price > EMA20 > EMA50')
        elif n['price'] < n['ema20'] < n['ema50']:
            score -= 2; reasons.append('price < EMA20 < EMA50')
    if n.get('rsi14') is not None:
        if n['rsi14'] >= 55: score += 1.5; reasons.append('RSI bullish')
        elif n['rsi14'] <= 45: score -= 1.5; reasons.append('RSI bearish')
    if n.get('momentum5m_pct') is not None:
        score += 1 if n['momentum5m_pct'] > 0.12 else (-1 if n['momentum5m_pct'] < -0.12 else 0)
    if n.get('momentum15m_pct') is not None:
        score += 1 if n['momentum15m_pct'] > 0.25 else (-1 if n['momentum15m_pct'] < -0.25 else 0)
    if n.get('vwap') is not None:
        if n['price'] > n['vwap']: score += 1; reasons.append('above VWAP')
        elif n['price'] < n['vwap']: score -= 1; reasons.append('below VWAP')
    if v.get('change_pct') is not None and n.get('change_pct') is not None:
        if v['change_pct'] > 5 and n['change_pct'] < 0: score -= 1; reasons.append('VIX rising with NIFTY weakness')
        elif v['change_pct'] < -5 and n['change_pct'] > 0: score += 1; reasons.append('VIX falling with NIFTY strength')
    # Global confirmation is deliberately low-weight; it is context, not a trigger.
    for name, weight in [('SPX', 0.5), ('NASDAQ', 0.5)]:
        x = m.get(name, {})
        if x.get('change_pct') is not None:
            score += weight if x['change_pct'] > 0.25 else (-weight if x['change_pct'] < -0.25 else 0)
    return round(score, 2), reasons


def research_validation():
    try:
        d = yahoo_chart('^NSEI', '5m', '5d')
        q = d['indicators']['quote'][0]
        closes = clean_series(q.get('close', []))
        if len(closes) < 120: return {'samples': 0, 'hit_rate': None, 'method': 'insufficient history'}
        hits = samples = 0
        for i in range(60, len(closes) - 3):
            e20, e50 = ema(closes[:i], 20), ema(closes[:i], 50)
            rr = rsi(closes[:i])
            if not e20 or not e50 or rr is None: continue
            direction = 1 if e20 > e50 and rr > 52 else (-1 if e20 < e50 and rr < 48 else 0)
            if not direction: continue
            samples += 1
            future = closes[i+3] - closes[i]
            if (direction > 0 and future > 0) or (direction < 0 and future < 0): hits += 1
        return {'samples': samples, 'hit_rate': round(hits / samples * 100, 1) if samples else None, 'method': '5d 5m EMA20/EMA50 + RSI; directional research only'}
    except Exception:
        return {'samples': 0, 'hit_rate': None, 'method': 'validation unavailable'}


def load_history():
    try:
        with open(HISTORY, 'r', encoding='utf-8') as f: return json.load(f)
    except Exception:
        return []


def save_history(entry):
    h = load_history(); h.append(entry); h = h[-500:]
    with open(HISTORY, 'w', encoding='utf-8') as f: json.dump(h, f, indent=2)


def snapshot():
    now = datetime.now(timezone.utc).isoformat()
    symbols = {'NIFTY': '^NSEI', 'VIX': '^INDIAVIX', 'SPX': '^GSPC', 'NASDAQ': '^IXIC', 'USDINR': 'INR=X', 'CRUDE': 'CL=F', 'GOLD': 'GC=F'}
    result = {
        'generated_at': now, 'timestamp': now, 'owner': 'Rupendra',
        'source_quality': 'PUBLIC_RESEARCH_FEEDS', 'live_broker_feed': False,
        'decision': 'NO TRADE', 'signal_strength': 0,
        'reason': 'Waiting for complete independent confirmation. The system abstains rather than fabricate a CALL/PUT.',
        'nifty': None, 'vix': None, 'regime': 'UNKNOWN', 'market': {},
        'evidence': [], 'news': [], 'option_data': {'status': 'BLOCKED', 'reason': 'No verified licensed live options feed is connected.'},
        'contract': None, 'plan': None, 'pnl': None, 'journal': {'open': None, 'closed_count': 0},
        'validation': {}, 'data_quality': {}
    }
    for name, symbol in symbols.items():
        try: result['market'][name] = read_symbol(symbol)
        except Exception as exc: result['market'][name] = {'error': type(exc).__name__}
    n = result['market'].get('NIFTY', {}); v = result['market'].get('VIX', {})
    result['nifty'] = n.get('price'); result['vix'] = v.get('price')
    score, reasons = score_market(result['market']); result['evidence'] = reasons
    if n.get('price') is not None:
        result['regime'] = 'UP' if score >= 2.5 else ('DOWN' if score <= -2.5 else 'NEUTRAL')
    strength = min(100, int(50 + abs(score) * 8))
    result['signal_strength'] = strength
    result['news'] = fetch_news()
    result['validation'] = research_validation()
    required = ['NIFTY', 'VIX', 'SPX', 'NASDAQ', 'USDINR', 'CRUDE', 'GOLD']
    complete = all(result['market'].get(x, {}).get('price') is not None for x in required)
    result['data_quality'] = {'core_complete': complete, 'options_ready': False, 'news_count': len(result['news']), 'timestamp_utc': now}
    # No exact option recommendation unless an actual options feed is present.
    if complete and abs(score) >= 5 and result['option_data']['status'] == 'READY':
        result['decision'] = 'BUY CALL' if score > 0 else 'BUY PUT'
    else:
        result['decision'] = 'NO TRADE'
        if not complete: result['reason'] = 'NO TRADE — one or more independent market feeds are missing or stale.'
        elif abs(score) < 5: result['reason'] = f'NO TRADE — model alignment is insufficient (score {score}).'
        else: result['reason'] = 'NO TRADE — directional bias exists, but the exact option contract is not safely available.'
    # Underlying research levels are informational only, never presented as option entry targets.
    if n.get('price') is not None and n.get('atr14') is not None:
        p, a = n['price'], n['atr14']; direction = 1 if score > 0 else -1
        result['research_plan'] = {'underlying': 'NIFTY', 'bias': 'BULLISH' if direction > 0 else 'BEARISH', 'reference': p, 'invalidation': round(p - direction * 0.8 * a, 2), 'target1': round(p + direction * 1.2 * a, 2), 'target2': round(p + direction * 2.0 * a, 2), 'note': 'Research levels only; not an option order.'}
    else: result['research_plan'] = None
    entry = {'timestamp': now, 'nifty': result['nifty'], 'vix': result['vix'], 'regime': result['regime'], 'score': score, 'decision': result['decision']}
    save_history(entry)
    result['history_size'] = len(load_history())
    os.makedirs('data', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f: json.dump(result, f, indent=2)


if __name__ == '__main__': snapshot()
