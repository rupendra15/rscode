import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import intelligence_engine_v3 as v3

TZ=ZoneInfo('Asia/Kolkata')
OUT='data/market_snapshot.json'


def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f: json.dump(d,f,indent=2)


def collect_evidence(previous):
    m={}
    symbols={'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}
    old=previous.get('market') or {}
    for k,sym in symbols.items():
        try:
            fresh=v3.market_series(sym)
            fresh['source_status']='LIVE_OR_LATEST_PUBLIC'
            m[k]=fresh
        except Exception as e:
            prior=old.get(k)
            if prior:
                m[k]=dict(prior,source_status='LAST_SUCCESSFUL_PUBLIC_SNAPSHOT',stale=True,error=str(e))
            else:
                m[k]={'fresh':False,'stale':True,'source_status':'UNAVAILABLE','error':str(e)}
    news=v3.news()
    if not news: news=previous.get('news') or []
    spot=m.get('NIFTY',{}).get('price')
    try:
        options=v3.try_option_chain(spot) if spot else {'status':'NO_SPOT','calls':[],'puts':[],'fresh':False}
    except Exception as e:
        options={'status':'ERROR','calls':[],'puts':[],'fresh':False,'errors':[str(e)]}
    if not options.get('fresh') and previous.get('option_data'):
        # Preserve the last chain metadata for research visibility, but never turn it into a trade signal.
        oldopt=previous['option_data']
        options=dict(oldopt,stale=True,status=oldopt.get('status','NOT_VERIFIED'))
    try: validation=v3.validation()
    except Exception: validation=previous.get('validation') or {'samples':0,'hit_rate':None,'method':'unavailable'}
    n=m.get('NIFTY',{})
    return m,news,options,validation,n


def main():
    ist=v3.now_ist(); ts=datetime.now(timezone.utc).isoformat()
    previous=v3.load(OUT,{})
    if v3.market_open(ist):
        v3.main(); return
    m,news,options,validation,n=collect_evidence(previous)
    j=v3.load(v3.JOURNAL,{'open':None,'closed':[],'stats':{},'lessons':{}})
    previous_trade=j.get('closed',[])[-1] if j.get('closed') else None
    global_items=[]
    for k in ['SPX','NASDAQ','USDINR','CRUDE','GOLD']:
        x=m.get(k,{})
        global_items.append(f"{k}: {x.get('change_pct')}%" if x.get('change_pct') is not None else f"{k}: unavailable")
    price=n.get('price');ema20=n.get('ema20');ema50=n.get('ema50')
    regime='BULLISH' if ema20 and ema50 and price and price>ema20>ema50 else 'BEARISH' if ema20 and ema50 and price and price<ema20<ema50 else ('BEARISH_BIAS' if n.get('change_pct',0)<0 else 'MIXED')
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
      'owner':'Rupendra','engine_version':'4.1','timestamp':ts,'ist_time':ist.isoformat(),
      'market_open':False,'market_status':'MARKET CLOSED','decision':'MARKET CLOSED','decision_type':'SESSION_STATE',
      'signal_strength':0,'model_score':'RESEARCH','reason':'Trading decision is hidden outside NSE derivatives hours. The evidence engine remains active and retains the last successful public values when a free feed temporarily fails.',
      'previous_decision':previous_trade,'journal_stats':j.get('stats',{}),'learning':j.get('learning_summary',{}),
      'nifty':n.get('price'),'vix':m.get('VIX',{}).get('price'),'regime':regime,
      'market':m,'option_data':options,'candidate':{},'plan':{},'validation':validation,'news':news,'evidence':evidence,
      'research_state':{'evidence_engine':'ACTIVE','decision_engine':'OFF_OUTSIDE_SESSION','last_evidence_update':ts,'global_summary':global_items},
      'sources':{'public_market':'scheduled_public_research','options':options.get('status'),'news':'public_rss'},
      'data_quality':{'status':'EVIDENCE_ACTIVE_SESSION_CLOSED','nifty_fresh':n.get('fresh',False),'nifty_stale':n.get('stale',False),'options_fresh':options.get('fresh',False),'news_items':len(news)}
    }
    save(OUT,snap)

if __name__=='__main__': main()
