import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import intelligence_engine_v3 as v3

TZ=ZoneInfo('Asia/Kolkata')
OUT='data/market_snapshot.json'

def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f: json.dump(d,f,indent=2)

def collect_evidence():
    m={}
    symbols={'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}
    for k,sym in symbols.items():
        try: m[k]=v3.market_series(sym)
        except Exception as e: m[k]={'fresh':False,'error':str(e)}
    news=v3.news()
    spot=m.get('NIFTY',{}).get('price')
    try: options=v3.try_option_chain(spot) if spot else {'status':'NO_SPOT','calls':[],'puts':[],'fresh':False}
    except Exception as e: options={'status':'ERROR','calls':[],'puts':[],'fresh':False,'errors':[str(e)]}
    try: validation=v3.validation()
    except Exception: validation={'samples':0,'hit_rate':None,'method':'unavailable'}
    n=m.get('NIFTY',{})
    return m,news,options,validation,n

def main():
    ist=v3.now_ist(); ts=datetime.now(timezone.utc).isoformat()
    if v3.market_open(ist):
        v3.main(); return
    m,news,options,validation,n=collect_evidence()
    j=v3.load(v3.JOURNAL,{'open':None,'closed':[],'stats':{},'lessons':{}})
    previous=j.get('closed',[])[-1] if j.get('closed') else None
    global_items=[]
    for k in ['SPX','NASDAQ','USDINR','CRUDE','GOLD']:
        x=m.get(k,{})
        global_items.append(f"{k}: {x.get('change_pct')}%" if x.get('change_pct') is not None else f"{k}: unavailable")
    regime='BULLISH' if n.get('ema20') and n.get('ema50') and n.get('price',0)>n['ema20']>n['ema50'] else 'BEARISH' if n.get('ema20') and n.get('ema50') and n.get('price',0)<n['ema20']<n['ema50'] else 'MIXED'
    evidence=[
      f"NIFTY {n.get('price')} | EMA20 {n.get('ema20')} | EMA50 {n.get('ema50')}",
      f"RSI14 {n.get('rsi14')} | VWAP {n.get('vwap')} | ATR14 {n.get('atr14')}",
      f"5m momentum {n.get('momentum5m_pct')}% | 15m momentum {n.get('momentum15m_pct')}%",
      f"India VIX {m.get('VIX',{}).get('price')}",
      ' | '.join(global_items),
      f"Options: {options.get('status')} | PCR {options.get('pcr')} | Max pain {options.get('max_pain')}",
      f"Public news/macro items collected: {len(news)}",
      f"Historical validation hit rate: {validation.get('hit_rate')}% from {validation.get('samples')} samples"
    ]
    snap={
      'owner':'Rupendra','engine_version':'4.0','timestamp':ts,'ist_time':ist.isoformat(),
      'market_open':False,'market_status':'MARKET CLOSED','decision':'MARKET CLOSED','decision_type':'SESSION_STATE',
      'signal_strength':0,'model_score':None,
      'reason':'Market is closed. The decision engine is OFF for trading decisions, but the evidence engine remains ACTIVE and continuously refreshes available research data for the next session.',
      'previous_decision':previous,'journal_stats':j.get('stats',{}),'learning':j.get('learning_summary',{}),
      'nifty':n.get('price'),'vix':m.get('VIX',{}).get('price'),'regime':regime,
      'market':m,'option_data':options,'candidate':{},'plan':{},'validation':validation,'news':news,'evidence':evidence,
      'research_state':{'evidence_engine':'ACTIVE','decision_engine':'OFF_OUTSIDE_SESSION','last_evidence_update':ts,'global_summary':global_items},
      'sources':{'public_market':'scheduled_public_research','options':options.get('status'),'news':'public_rss'},
      'data_quality':{'status':'EVIDENCE_ACTIVE_SESSION_CLOSED','nifty_fresh':n.get('fresh',False),'options_fresh':options.get('fresh',False),'news_items':len(news)}
    }
    save(OUT,snap)

if __name__=='__main__': main()
