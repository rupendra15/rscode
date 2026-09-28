import json, math, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import intelligence_engine_v3 as v3

TZ=ZoneInfo('Asia/Kolkata')
OUT='data/market_snapshot.json'
JOURNAL=v3.JOURNAL

# v5 is an ensemble research engine. It never claims certainty: it abstains when
# independent evidence, validation, liquidity or data freshness is insufficient.

def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f: json.dump(d,f,indent=2)

def safe(x):
    try:
        x=float(x)
        return x if math.isfinite(x) else None
    except Exception:
        return None

def chart_data(symbol='^NSEI'):
    d=v3.chart(symbol,interval='5m',range_='5d')
    q=d['indicators']['quote'][0]
    return [safe(x) for x in q.get('open',[])], [safe(x) for x in q.get('high',[])], [safe(x) for x in q.get('low',[])], [safe(x) for x in q.get('close',[])], [safe(x) for x in q.get('volume',[])]

def clean(xs): return [x for x in xs if x is not None]

def pct(a,b): return (a/b-1)*100 if a is not None and b else None

def rolling_mean(xs,n):
    if len(xs)<n:return None
    return sum(xs[-n:])/n

def stdev(xs):
    if len(xs)<2:return 0
    m=sum(xs)/len(xs)
    return math.sqrt(sum((x-m)**2 for x in xs)/(len(xs)-1))

def pattern_engine():
    o,h,l,c,vol=chart_data()
    c=clean(c); h=clean(h); l=clean(l); o=clean(o); vol=clean(vol)
    if len(c)<80:return {'status':'INSUFFICIENT_HISTORY','patterns':[],'scores':{},'time_of_day':None}
    last=c[-1]; prev=c[-2]
    patterns=[]; scores={}
    ema20=v3.ema(c,20); ema50=v3.ema(c,50); r=v3.rsi(c); atr=v3.atr(h,l,c)
    hi20=max(h[-21:-1]); lo20=min(l[-21:-1])
    if last>hi20:
        patterns.append('20-bar breakout'); scores['breakout']=2.0
    elif last<lo20:
        patterns.append('20-bar breakdown'); scores['breakdown']=-2.0
    else:
        scores['breakout']=0
    if ema20 and ema50 and last>ema20>ema50 and last<hi20*1.01:
        patterns.append('bullish trend / pullback zone'); scores['trend_pullback']=1.5
    elif ema20 and ema50 and last<ema20<ema50 and last>lo20*.99:
        patterns.append('bearish trend / pullback zone'); scores['trend_pullback']=-1.5
    else:scores['trend_pullback']=0
    body=abs(last-prev); range_=max(h[-1]-l[-1],1e-9)
    if body/range_<0.25: patterns.append('indecision candle'); scores['indecision']=0
    if r is not None:
        if r>=70: patterns.append('overbought momentum'); scores['rsi_extreme']=-0.75
        elif r<=30: patterns.append('oversold momentum'); scores['rsi_extreme']=0.75
        else:scores['rsi_extreme']=0
    rets=[pct(c[i],c[i-1]) for i in range(1,len(c))]
    rets=clean(rets[-60:]); vol_reg='HIGH' if stdev(rets)>0.35 else 'LOW' if stdev(rets)<0.12 else 'NORMAL'
    patterns.append('volatility '+vol_reg.lower())
    scores['volatility']=0.25 if vol_reg=='NORMAL' else -0.25
    # Intraday time-of-day tendency from the last five sessions. This is descriptive,
    # not a standalone trading signal.
    tod=None
    try:
        d=v3.chart('^NSEI',interval='5m',range_='5d')
        ts=d.get('timestamp') or []
        q=d['indicators']['quote'][0]['close']
        buckets={}
        for i in range(1,min(len(ts),len(q))):
            if q[i] is None or q[i-1] is None:continue
            dt=datetime.fromtimestamp(ts[i],timezone.utc).astimezone(TZ)
            key=dt.strftime('%H:%M')
            buckets.setdefault(key,[]).append((q[i]/q[i-1]-1)*100)
        now=v3.now_ist().strftime('%H:%M')
        vals=buckets.get(now,[])
        if vals: tod={'clock':now,'samples':len(vals),'avg_5m_pct':round(sum(vals)/len(vals),4),'positive_rate':round(sum(x>0 for x in vals)/len(vals)*100,1)}
    except Exception: pass
    return {'status':'OK','patterns':patterns,'scores':scores,'volatility_regime':vol_reg,'time_of_day':tod,'ema20':ema20,'ema50':ema50,'rsi':r,'atr':atr}

def news_risk(news):
    txt=' '.join((x.get('title') or '').lower() for x in news)
    risk_words=['rbi','fed','fomc','inflation','cpi','tariff','war','missile','sanction','crisis','default','election','geopolitical','rate hike','rate cut']
    hits=[w for w in risk_words if w in txt]
    bullish=['growth','beat','upgrade','easing','rate cut','stimulus','inflow']
    bearish=['war','tariff','sanction','inflation','rate hike','downgrade','outflow','crisis']
    bull=sum(txt.count(x) for x in bullish); bear=sum(txt.count(x) for x in bearish)
    return {'risk_terms':hits,'risk_level':'ELEVATED' if hits else 'NORMAL','headline_bias':'BULLISH' if bull>bear else 'BEARISH' if bear>bull else 'MIXED','bull_terms':bull,'bear_terms':bear}

def enhanced_validation():
    base=v3.validation()
    try:
        _,_,_,c,_=chart_data(); c=clean(c); samples=hits=0
        by_regime={}
        for i in range(60,len(c)-4):
            e20=v3.ema(c[:i],20);e50=v3.ema(c[:i],50);rr=v3.rsi(c[:i])
            if not e20 or not e50 or rr is None:continue
            direction=1 if e20>e50 and rr>52 else -1 if e20<e50 and rr<48 else 0
            if not direction:continue
            future=c[i+3]-c[i]; ok=(direction>0 and future>0) or (direction<0 and future<0)
            regime='BULL' if e20>e50 else 'BEAR'
            z=by_regime.setdefault(regime,[0,0]);z[0]+=1;z[1]+=int(ok)
            samples+=1;hits+=int(ok)
        return {'samples':samples,'hit_rate':round(hits/samples*100,1) if samples else base.get('hit_rate'),'method':'rolling 5m EMA20/EMA50 + RSI, 3-bar forward direction','by_regime':{k:{'samples':v[0],'hit_rate':round(v[1]/v[0]*100,1)} for k,v in by_regime.items()}}
    except Exception:return base

def collect():
    previous=v3.load(OUT,{})
    m={}; symbols={'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}
    old=previous.get('market') or {}
    for k,sym in symbols.items():
        try:
            x=v3.market_series(sym);x['source_status']='LIVE_OR_LATEST_PUBLIC';m[k]=x
        except Exception as e:
            m[k]=dict(old.get(k,{}),source_status='LAST_SUCCESSFUL_PUBLIC_SNAPSHOT',stale=True,error=str(e)) if old.get(k) else {'fresh':False,'stale':True,'source_status':'UNAVAILABLE','error':str(e)}
    news=v3.news() or previous.get('news') or []
    n=m.get('NIFTY',{});spot=n.get('price')
    try: options=v3.try_option_chain(spot) if spot else {'status':'NO_SPOT','calls':[],'puts':[],'fresh':False}
    except Exception as e: options={'status':'ERROR','calls':[],'puts':[],'fresh':False,'errors':[str(e)]}
    validation=enhanced_validation()
    patterns=pattern_engine()
    nr=news_risk(news)
    return previous,m,news,options,validation,patterns,nr

def decision(m,options,validation,patterns,nr,ist):
    n=m.get('NIFTY',{}); spot=n.get('price')
    if not spot:return 'NO TRADE',0,0,[],{},'No verified NIFTY price.'
    score=0; reasons=[]; factors={}
    def add(k,x,why):
        nonlocal score; factors[k]=round(x,2);score+=x;reasons.append(why)
    e20,e50=n.get('ema20'),n.get('ema50'); r=n.get('rsi14'); vw=n.get('vwap')
    if e20 and e50:
        add('trend',2.5 if spot>e20>e50 else -2.5 if spot<e20<e50 else 0,'Trend: '+('bullish alignment' if spot>e20>e50 else 'bearish alignment' if spot<e20<e50 else 'mixed'))
    if r is not None:add('rsi',1.5 if 55<=r<=68 else -1.5 if 32<=r<=45 else 0,'RSI: '+str(r))
    if vw:add('vwap',1 if spot>vw else -1,'VWAP: price '+('above' if spot>vw else 'below'))
    for k,label in [('SPX','S&P 500'),('NASDAQ','NASDAQ')]:
        x=m.get(k,{}).get('change_pct');add(k,.75 if x is not None and x>.25 else -.75 if x is not None and x<-.25 else 0,label+' confirmation '+str(x)+'%')
    for k in ['breakout','breakdown','trend_pullback','rsi_extreme','volatility']:
        if patterns.get('scores',{}).get(k) is not None:add('pattern_'+k,patterns['scores'][k],'Pattern: '+k)
    if options.get('pcr') is not None:add('pcr',.75 if options['pcr']<.9 else -.75 if options['pcr']>1.1 else 0,'PCR '+str(options['pcr']))
    if nr['risk_level']=='ELEVATED':add('event_risk',-1.0,'Macro/event risk elevated; requiring stronger confirmation')
    # Require independent confirmation. Exact option selection is only allowed with a fresh chain.
    bull=score>=6.5; bear=score<=-6.5
    candidate={}
    if options.get('fresh'):
        cs=v3.option_candidates(options,spot,'CE' if bull else 'PE') if (bull or bear) else []
        if cs:candidate=cs[0]
    validation_ok=validation.get('hit_rate') is not None and validation.get('samples',0)>=30 and validation.get('hit_rate',0)>=55
    option_ok=bool(candidate) and candidate.get('candidate_score',0)>=65
    freshness=sum(1 for k in ['NIFTY','VIX','SPX','NASDAQ','USDINR','CRUDE','GOLD'] if m.get(k,{}).get('fresh'))
    data_ok=freshness>=5
    confidence=min(99,max(0,50+score*5+(10 if validation_ok else -15)+(10 if option_ok else -20)+(5 if data_ok else -10)))
    action='BUY CALL' if bull and validation_ok and option_ok and data_ok and nr['risk_level']=='NORMAL' else 'BUY PUT' if bear and validation_ok and option_ok and data_ok and nr['risk_level']=='NORMAL' else 'NO TRADE'
    if action!='NO TRADE': reasons.append('All independent gates passed: trend/momentum, global confirmation, validation, data freshness, option liquidity and event-risk filter.')
    else: reasons.append('Abstention gate: at least one independent confirmation/validation/liquidity/freshness condition is not strong enough.')
    return action,round(score,2),round(confidence,1),reasons,factors,candidate

def main():
    ist=v3.now_ist();ts=datetime.now(timezone.utc).isoformat();previous,m,news,options,validation,patterns,nr=collect()
    j=v3.load(JOURNAL,{'open':None,'closed':[],'stats':{},'lessons':{}})
    action,score,confidence,reasons,factors,candidate=decision(m,options,validation,patterns,nr,ist)
    n=m.get('NIFTY',{}); market=v3.market_open(ist)
    plan={}
    if market and action!='NO TRADE' and candidate:
        entry=candidate.get('ask') or candidate.get('last'); atr=n.get('atr14') or 20
        stop=round(max(0,entry-1.0*atr),2); t1=round(entry+1.5*atr,2); t2=round(entry+2.5*atr,2)
        if action=='BUY PUT': stop=round(entry+1.0*atr,2);t1=round(max(0,entry-1.5*atr),2);t2=round(max(0,entry-2.5*atr),2)
        plan={'entry':entry,'stop':stop,'target1':t1,'target2':t2,'note':'Risk levels are model-derived from option premium and NIFTY ATR; revalidate before entry.'}
    prev=j.get('closed',[])[-1] if j.get('closed') else None
    decision_out=action if market else 'MARKET CLOSED'
    ev=[
      f"Trend/structure: EMA20 {n.get('ema20')} | EMA50 {n.get('ema50')} | VWAP {n.get('vwap')}",
      f"Momentum: RSI14 {n.get('rsi14')} | 5m {n.get('momentum5m_pct')}% | 15m {n.get('momentum15m_pct')}%",
      f"Pattern engine: {', '.join(patterns.get('patterns',[])) or 'no high-confidence named pattern'}",
      f"Volatility regime: {patterns.get('volatility_regime')} | ATR14 {n.get('atr14')}",
      f"Options: {options.get('status')} | PCR {options.get('pcr')} | Max pain {options.get('max_pain')}",
      f"Option candidate: {candidate.get('contractSymbol','none')} | score {candidate.get('candidate_score','—')} | spread {candidate.get('spread_pct','—')}%",
      f"Validation: {validation.get('hit_rate')}% across {validation.get('samples')} samples | {validation.get('method')}",
      f"News/event filter: {nr.get('risk_level')} | bias {nr.get('headline_bias')} | risk terms {', '.join(nr.get('risk_terms',[])) or 'none'}",
      f"Time-of-day: {patterns.get('time_of_day')}",
      f"Decision gates: {' | '.join(reasons)}"
    ]
    snap={'owner':'Rupendra','engine_version':'5.0','timestamp':ts,'ist_time':ist.isoformat(),'market_open':market,'market_status':'OPEN' if market else 'MARKET CLOSED','decision':decision_out,'decision_type':'TRADE_SIGNAL' if market else 'SESSION_STATE','signal_strength':round(confidence,1) if market else 0,'model_score':score if market else score,'confidence':confidence if market else None,'reason':' '.join(reasons),'previous_decision':prev,'journal_stats':j.get('stats',{}),'learning':j.get('learning_summary',{}),'nifty':n.get('price'),'vix':m.get('VIX',{}).get('price'),'regime':'BULLISH' if score>2 else 'BEARISH' if score<-2 else 'MIXED','market':m,'option_data':options,'candidate':candidate,'plan':plan,'validation':validation,'news':news,'evidence':ev,'patterns':patterns,'news_risk':nr,'factor_scores':factors,'research_state':{'evidence_engine':'ACTIVE','decision_engine':'ACTIVE' if market else 'OFF_OUTSIDE_SESSION','pattern_engine':'ACTIVE','validation_engine':'ACTIVE','learning_engine':'ACTIVE','last_evidence_update':ts},'sources':{'public_market':'Yahoo Finance public chart endpoint','options':options.get('source_status') or options.get('status'),'news':'Google News public RSS'},'data_quality':{'status':'OK' if n.get('fresh') else 'PARTIAL','fresh_sources':sum(1 for k in m if m[k].get('fresh')),'required_for_signal':5}}
    save(OUT,snap)
    # Keep a compact decision audit record even outside the session; it is not a trade signal.
    hist=v3.load(v3.HISTORY,[])
    hist.append({'ist_time':ist.isoformat(),'nifty':n.get('price'),'decision':decision_out,'contract':candidate.get('contractSymbol') if market else None,'score':score,'option_status':options.get('status'),'engine_version':'5.0'})
    save(v3.HISTORY,hist[-500:])

if __name__=='__main__': main()
