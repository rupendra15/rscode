import json, math, os
from datetime import datetime, timezone
import requests

UA = {'User-Agent': 'Mozilla/5.0 (NIFTY Intelligence Terminal; research)'}
OUT = 'data/market_snapshot.json'

def yahoo_chart(symbol, interval='5m', range_='1d'):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
    r=requests.get(url, params={'interval':interval,'range':range_}, headers=UA, timeout=15)
    r.raise_for_status(); return r.json()['chart']['result'][0]

def last_price(symbol):
    d=yahoo_chart(symbol,'5m','1d'); q=d['indicators']['quote'][0]
    closes=[x for x in q.get('close',[]) if x is not None]
    vols=[x for x in q.get('volume',[]) if x is not None]
    return {'symbol':symbol,'price':closes[-1] if closes else None,'volume':vols[-1] if vols else None}

def rsi(closes, n=14):
    if len(closes)<=n: return None
    gains=[]; losses=[]
    for a,b in zip(closes[-n-1:-1],closes[-n:]):
        d=b-a; gains.append(max(d,0)); losses.append(max(-d,0))
    ag=sum(gains)/n; al=sum(losses)/n
    return round(100 if al==0 else 100-(100/(1+ag/al)),2)

def snapshot():
    now=datetime.now(timezone.utc).isoformat()
    result={'generated_at':now,'source_quality':'PUBLIC_RESEARCH_FEEDS','live_broker_feed':False,'decision':'NO TRADE','reason':'No licensed real-time derivatives feed is connected; free public data must not be represented as exchange-direct live data.','market':{}}
    symbols={'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}
    for name,sym in symbols.items():
        try:
            d=yahoo_chart(sym,'5m','1d'); q=d['indicators']['quote'][0]
            closes=[x for x in q.get('close',[]) if x is not None]
            vols=[x for x in q.get('volume',[]) if x is not None]
            result['market'][name]={'price':closes[-1] if closes else None,'rsi14':rsi(closes),'volume':vols[-1] if vols else None}
        except Exception as e:
            result['market'][name]={'error':type(e).__name__}
    os.makedirs('data',exist_ok=True)
    with open(OUT,'w') as f: json.dump(result,f,indent=2)

if __name__=='__main__': snapshot()
