import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import intelligence_engine_v3 as v3

OUT='data/chart_snapshot.json'
TZ=ZoneInfo('Asia/Kolkata')

def clean(xs):
    return [float(x) if x is not None else None for x in (xs or [])]

def main():
    d=v3.chart('^NSEI',interval='5m',range_='5d')
    q=d['indicators']['quote'][0]
    ts=d.get('timestamp') or []
    o,h,l,c,v=[clean(q.get(k)) for k in ('open','high','low','close','volume')]
    rows=[]
    for i,t in enumerate(ts):
        if i>=len(o) or i>=len(h) or i>=len(l) or i>=len(c): continue
        if None in (o[i],h[i],l[i],c[i]): continue
        dt=datetime.fromtimestamp(t,timezone.utc).astimezone(TZ)
        rows.append({'t':dt.isoformat(),'o':round(o[i],2),'h':round(h[i],2),'l':round(l[i],2),'c':round(c[i],2),'v':int(v[i]) if i<len(v) and v[i] is not None else 0})
    rows=rows[-240:]
    closes=[x['c'] for x in rows]
    ema20=v3.ema(closes,20); ema50=v3.ema(closes,50)
    payload={'symbol':'NIFTY 50','interval':'5m','updated_at':datetime.now(timezone.utc).isoformat(),'source':'Yahoo Finance public chart endpoint','bars':rows,'indicators':{'ema20':round(ema20,2) if ema20 else None,'ema50':round(ema50,2) if ema50 else None},'quality':{'bars':len(rows),'note':'Public market data; not exchange-direct tick feed.'}}
    os.makedirs('data',exist_ok=True)
    with open(OUT,'w',encoding='utf-8') as f: json.dump(payload,f,separators=(',',':'))

if __name__=='__main__': main()
