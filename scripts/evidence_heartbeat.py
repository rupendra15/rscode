import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests
import xml.etree.ElementTree as ET

TZ=ZoneInfo('Asia/Kolkata')
OUT='data/evidence_heartbeat.json'
UA={'User-Agent':'Mozilla/5.0 Rupendra-NIFTY-Intelligence/4.0'}
HOLIDAYS={'2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25'}

def chart(symbol):
    r=requests.get('https://query1.finance.yahoo.com/v8/finance/chart/'+symbol,params={'interval':'5m','range':'1d'},headers=UA,timeout=12)
    r.raise_for_status(); z=(r.json().get('chart',{}).get('result') or [None])[0]
    if not z: raise RuntimeError('no data')
    q=z['indicators']['quote'][0]; c=[x for x in q.get('close',[]) if x is not None]
    p=c[-1] if c else None; prev=c[-2] if len(c)>1 else None
    return {'price':round(p,2) if p is not None else None,'change_pct':round((p-prev)/prev*100,3) if p and prev else None,'bars':len(c),'fresh':bool(c)}

def news():
    out=[]; seen=set()
    for q in ['NIFTY India markets RBI Fed','India options volatility','India rupee crude gold markets']:
        try:
            r=requests.get('https://news.google.com/rss/search',params={'q':q,'hl':'en-IN','gl':'IN','ceid':'IN:en'},headers=UA,timeout=8)
            root=ET.fromstring(r.text)
            for item in root.findall('./channel/item')[:5]:
                title=item.findtext('title'); pub=item.findtext('pubDate')
                if title and title not in seen: seen.add(title); out.append({'title':title,'published':pub})
        except Exception: pass
    return out[:20]

def main():
    now=datetime.now(timezone.utc); ist=now.astimezone(TZ); day=ist.date().isoformat()
    weekday=ist.weekday()<5 and day not in HOLIDAYS
    session=weekday and ist.hour*60+ist.minute >= 555 and ist.hour*60+ist.minute <= 940
    assets={'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}
    markets={}; errors={}
    for name,symbol in assets.items():
        try: markets[name]=chart(symbol)
        except Exception as e: errors[name]=str(e)
    state={'owner':'Rupendra','engine':'evidence-heartbeat-1.0','updated_at':now.isoformat(),'ist_time':ist.isoformat(),'session':{'trading_day':weekday,'market_open':session,'status':'MARKET OPEN' if session else 'MARKET CLOSED'},'markets':markets,'news':news(),'errors':errors,'option_feed':{'status':'UNAVAILABLE_UNTIL_RELIABLE_PUBLIC_CHAIN','decision_policy':'Never invent an option contract when the chain is unavailable.'},'learning_policy':{'continuous_evidence':True,'continuous_learning':True,'live_decisions_only_in_session':True}}
    os.makedirs('data',exist_ok=True)
    with open(OUT,'w',encoding='utf-8') as f: json.dump(state,f,indent=2)
if __name__=='__main__': main()
