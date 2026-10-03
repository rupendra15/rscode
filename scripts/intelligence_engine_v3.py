import json, math, os
from datetime import datetime, timezone, time
from zoneinfo import ZoneInfo
import requests
import xml.etree.ElementTree as ET

TZ = ZoneInfo('Asia/Kolkata')
OUT='data/market_snapshot.json'; HISTORY='data/history.json'; JOURNAL='data/trade_journal.json'
UA={'User-Agent':'Mozilla/5.0 Rupendra-NIFTY-Research-Terminal/3.0'}
HOLIDAYS={'2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25'}


def now_ist(): return datetime.now(timezone.utc).astimezone(TZ)
def market_open(dt=None):
    dt=dt or now_ist(); return dt.weekday()<5 and dt.date().isoformat() not in HOLIDAYS and time(9,15)<=dt.time()<=time(15,40)
def load(p,d):
    try:
        with open(p,encoding='utf-8') as f:return json.load(f)
    except Exception:return d
def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f:json.dump(d,f,indent=2)
def clean(a): return [float(x) for x in (a or []) if x is not None]
def ema(a,n):
    if len(a)<n:return None
    k=2/(n+1);e=sum(a[:n])/n
    for x in a[n:]:e=x*k+e*(1-k)
    return e
def rsi(a,n=14):
    if len(a)<=n:return None
    g=[];l=[]
    for x,y in zip(a[-n-1:-1],a[-n:]):
        d=y-x;g.append(max(d,0));l.append(max(-d,0))
    ag,al=sum(g)/n,sum(l)/n
    return 100 if al==0 else 100-100/(1+ag/al)
def atr(h,l,c,n=14):
    if len(c)<=n:return None
    tr=[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,len(c))]
    return sum(tr[-n:])/n
def vwap(h,l,c,v):
    pv=vv=0
    for a,b,x,q in zip(h,l,c,v):pv+=(a+b+x)/3*q;vv+=q
    return pv/vv if vv else None
def chart(symbol,interval='5m',range_='5d'):
    r=requests.get('https://query1.finance.yahoo.com/v8/finance/chart/'+symbol,params={'interval':interval,'range':range_},headers=UA,timeout=15);r.raise_for_status()
    z=(r.json().get('chart',{}).get('result') or [])
    if not z: raise RuntimeError('no chart data')
    return z[0]
def market_series(symbol):
    d=chart(symbol);q=d['indicators']['quote'][0];c=clean(q.get('close'));h=clean(q.get('high'));l=clean(q.get('low'));v=clean(q.get('volume'));p=c[-1] if c else None;prev=c[-2] if len(c)>1 else None
    return {'price':round(p,2) if p else None,'change_pct':round((p-prev)/prev*100,2) if p and prev else None,'ema20':round(ema(c,20),2) if ema(c,20) else None,'ema50':round(ema(c,50),2) if ema(c,50) else None,'rsi14':round(rsi(c),2) if rsi(c) is not None else None,'atr14':round(atr(h,l,c),2) if atr(h,l,c) else None,'vwap':round(vwap(h[-78:],l[-78:],c[-78:],v[-78:]),2) if len(c)>=20 and vwap(h[-78:],l[-78:],c[-78:],v[-78:]) else None,'momentum5m_pct':round((p/c[-2]-1)*100,3) if len(c)>2 else None,'momentum15m_pct':round((p/c[-4]-1)*100,3) if len(c)>4 else None,'high_5d':round(max(h),2) if h else None,'low_5d':round(min(l),2) if l else None,'volume':int(v[-1]) if v else None,'bars':len(c),'fresh':True}
def news():
    out=[];seen=set()
    for q in ['NIFTY India markets RBI Fed','India options market volatility','India inflation RBI rates rupee','NIFTY global markets crude gold']:
        try:
            r=requests.get('https://news.google.com/rss/search',params={'q':q,'hl':'en-IN','gl':'IN','ceid':'IN:en'},headers=UA,timeout=8);root=ET.fromstring(r.text)
            for it in root.findall('./channel/item')[:5]:
                t=it.findtext('title');p=it.findtext('pubDate')
                if t and t not in seen:seen.add(t);out.append({'title':t,'published':p})
        except Exception: pass
    return out[:15]
def nse_option_chain():
    """Best-effort public NSE website option-chain reader. Not an exchange tick feed."""
    s=requests.Session()
    h={**UA,'Accept':'application/json,text/plain,*/*','Accept-Language':'en-IN,en;q=0.9','Referer':'https://www.nseindia.com/option-chain'}
    s.headers.update(h)
    s.get('https://www.nseindia.com/',timeout=12)
    s.get('https://www.nseindia.com/option-chain',timeout=12)
    r=s.get('https://www.nseindia.com/api/option-chain-indices',params={'symbol':'NIFTY'},timeout=15)
    r.raise_for_status()
    z=r.json(); records=z.get('records',{}); expiries=records.get('expiryDates') or []
    if not expiries: raise RuntimeError('NSE returned no expiry')
    rows=[]
    for rec in records.get('data',[]):
        strike=rec.get('strikePrice')
        for side in ('CE','PE'):
            x=rec.get(side)
            if not x: continue
            rows.append({'contractSymbol':x.get('identifier'),'strike':strike,'lastPrice':x.get('lastPrice'),
              'bid':x.get('bidprice'),'ask':x.get('askPrice'),'volume':x.get('totalTradedVolume') or 0,
              'openInterest':x.get('openInterest') or 0,'changeinOpenInterest':x.get('changeinOpenInterest') or 0,
              'impliedVolatility':x.get('impliedVolatility') or 0,'side':side,
              'totalBuyQuantity':x.get('totalBuyQuantity') or 0,'totalSellQuantity':x.get('totalSellQuantity') or 0,
              'timestamp':x.get('lastUpdateTime')})
    calls=[x for x in rows if x['side']=='CE']; puts=[x for x in rows if x['side']=='PE']
    coi=sum(x['openInterest'] or 0 for x in calls); poi=sum(x['openInterest'] or 0 for x in puts)
    pcr=poi/coi if coi else None
    strikes=sorted(set(x['strike'] for x in rows if x.get('strike') is not None)); mp=None
    if strikes:
        pains=[]
        for s0 in strikes:
            pain=sum(max(0,s0-x['strike'])*(x['openInterest'] or 0) for x in calls)+sum(max(0,x['strike']-s0)*(x['openInterest'] or 0) for x in puts)
            pains.append((pain,s0))
        mp=min(pains)[1] if pains else None
    return {'status':'NSE_PUBLIC_OPTION_CHAIN','source':'NSE public option-chain endpoint','expiry':expiries[0],
      'calls':calls,'puts':puts,'pcr':round(pcr,3) if pcr else None,'max_pain':mp,'count':len(rows),'fresh':True,
      'retrieved_at':datetime.now(timezone.utc).isoformat(),'note':'Public NSE webpage data; not exchange-direct tick-by-tick.'}

def try_option_chain(spot):
    errors=[]
    for host in ['query1.finance.yahoo.com','query2.finance.yahoo.com']:
        try:
            base=f'https://{host}/v7/finance/options/%5ENSEI'
            r=requests.get(base,headers=UA,timeout=12);r.raise_for_status();z=(r.json().get('optionChain',{}).get('result') or [None])[0]
            if not z: raise RuntimeError('empty chain')
            exps=z.get('expirationDates') or []
            if not exps: raise RuntimeError('no expiry')
            exp=int(exps[0]);rr=requests.get(base,params={'date':exp},headers=UA,timeout=12);rr.raise_for_status();z=(rr.json().get('optionChain',{}).get('result') or [None])[0]
            raw=(z or {}).get('options',[{}])[0];calls=raw.get('calls',[]);puts=raw.get('puts',[])
            call_oi=sum(x.get('openInterest') or 0 for x in calls);put_oi=sum(x.get('openInterest') or 0 for x in puts);pcr=put_oi/call_oi if call_oi else None
            strikes=sorted(set(x.get('strike') for x in calls+puts if x.get('strike') is not None));maxpain=None
            if strikes:
                pains=[]
                for s in strikes:
                    pain=sum(max(0,s-x.get('strike',0))*(x.get('openInterest') or 0) for x in calls)+sum(max(0,x.get('strike',0)-s)*(x.get('openInterest') or 0) for x in puts);pains.append((pain,s))
                maxpain=min(pains)[1]
            return {'status':'LIVE_PUBLIC_OPTIONS','source':host,'expiry_epoch':exp,'expiry':datetime.fromtimestamp(exp,timezone.utc).date().isoformat(),'calls':calls,'puts':puts,'pcr':round(pcr,3) if pcr else None,'max_pain':maxpain,'count':len(calls)+len(puts),'fresh':True}
        except Exception as e: errors.append(host+': '+str(e))
    try:
        return nse_option_chain()
    except Exception as e:
        errors.append('nse_public: '+str(e))
    return {'status':'BLOCKED_NO_RELIABLE_FREE_CHAIN','source':'public-free-fallback','calls':[],'puts':[],'pcr':None,'max_pain':None,'count':0,'fresh':False,'errors':errors}
def bs_delta(spot,strike,iv,days,kind):
    if not iv or not days or spot<=0 or strike<=0:return None
    t=max(days/365,.00274);vol=max(iv,.01)
    d1=(math.log(spot/strike)+(.065+.5*vol*vol)*t)/(vol*math.sqrt(t));cdf=.5*(1+math.erf(d1/math.sqrt(2)))
    return cdf if kind=='CE' else cdf-1
def option_candidates(chain,spot,kind):
    if not chain.get('calls'):return []
    side=chain['calls'] if kind=='CE' else chain['puts'];days=max((datetime.fromisoformat(chain['expiry']).replace(tzinfo=timezone.utc)-datetime.now(timezone.utc)).total_seconds()/86400,.5);out=[]
    for x in side:
        strike=x.get('strike');last=x.get('lastPrice');bid=x.get('bid');ask=x.get('ask');oi=x.get('openInterest') or 0;vol=x.get('volume') or 0;iv=x.get('impliedVolatility') or 0
        if not strike or not last or bid is None or ask is None or ask<=bid or oi<300 or vol<50 or iv<=0:continue
        mid=(bid+ask)/2;spr=(ask-bid)/mid if mid else 1
        if spr>.15 or abs(strike-spot)>max(800,spot*.04):continue
        d=bs_delta(spot,strike,iv,days,kind)
        if d is None:continue
        target=.45 if kind=='CE' else -.45;fit=max(0,1-abs(d-target)/.35);liq=min(1,math.log10(1+vol)/6)*.5+min(1,math.log10(1+oi)/7)*.5;sp=max(0,1-spr/.15);dist=max(0,1-abs(strike-spot)/(spot*.04));score=100*(.4*fit+.3*liq+.2*sp+.1*dist)
        out.append({'candidate_score':round(score,1),'contractSymbol':x.get('contractSymbol'),'strike':strike,'last':last,'bid':bid,'ask':ask,'volume':vol,'oi':oi,'iv':iv,'delta_est':round(d,3),'spread_pct':round(spr*100,2),'side':kind,'expiry':chain['expiry']})
    return sorted(out,key=lambda x:x['candidate_score'],reverse=True)
def factor_score(m,chain):
    n=m['NIFTY'];s=0;reasons=[];factors={}
    def add(name,val,reason):
        nonlocal s; factors[name]=round(val,2);s+=val;reasons.append(reason)
    if n.get('ema20') and n.get('ema50'):
        if n['price']>n['ema20']>n['ema50']:add('trend',2.5,'Trend aligned bullish: price > EMA20 > EMA50')
        elif n['price']<n['ema20']<n['ema50']:add('trend',-2.5,'Trend aligned bearish: price < EMA20 < EMA50')
        else:add('trend',0,'Trend mixed: moving averages are not aligned')
    rr=n.get('rsi14')
    if rr is not None:
        add('rsi',1.5 if rr>=55 else -1.5 if rr<=45 else 0,'RSI '+str(rr)+' '+('supports momentum' if rr>=55 or rr<=45 else 'is neutral'))
    for key,label,threshold in [('momentum5m_pct','5m momentum',.10),('momentum15m_pct','15m momentum',.20)]:
        x=n.get(key);add(label,1 if x is not None and x>threshold else -1 if x is not None and x<-threshold else 0,label+' '+str(x)+'%')
    if n.get('vwap') is not None:add('vwap',1 if n['price']>n['vwap'] else -1,'Price '+('above' if n['price']>n['vwap'] else 'below')+' VWAP')
    for k,label,threshold in [('SPX','US S&P 500',.25),('NASDAQ','NASDAQ',.25)]:
        x=m.get(k,{}).get('change_pct');add(label,.5 if x is not None and x>threshold else -.5 if x is not None and x<-threshold else 0,label+' change '+str(x)+'%')
    if chain.get('pcr') is not None:add('pcr',.75 if chain['pcr']<.9 else -.75 if chain['pcr']>1.1 else 0,'Option PCR '+str(chain['pcr']))
    return round(s,2),reasons,factors
def validation():
    try:
        c=clean(chart('^NSEI')['indicators']['quote'][0].get('close'));hits=samples=0
        for i in range(55,len(c)-4):
            e20,e50=ema(c[:i],20),ema(c[:i],50);rr=rsi(c[:i]);d=1 if e20 and e50 and rr and e20>e50 and rr>52 else -1 if e20 and e50 and rr and e20<e50 and rr<48 else 0
            if not d:continue
            samples+=1;future=c[i+3]-c[i];hits+=int((d>0 and future>0) or (d<0 and future<0))
        return {'samples':samples,'hit_rate':round(hits/samples*100,1) if samples else None,'method':'rolling 5m EMA20/EMA50 + RSI; 3-bar forward direction'}
    except Exception:return {'samples':0,'hit_rate':None,'method':'unavailable'}
def update_learning(j,result):
    closed=j.setdefault('closed',[]);openp=j.get('open')
    # Free public option data may be unavailable; therefore only real option positions are journaled.
    if openp and result.get('candidate') and result['candidate'].get('contractSymbol')==openp.get('symbol'):
        last=result['candidate'].get('last') or openp.get('last');openp['last']=last;openp['unrealized_pct']=round((last/openp['entry']-1)*100,2) if last else None
        reason=None
        if last and last<=openp['stop']:reason='STOP_LOSS'
        elif last and last>=openp['target2']:reason='TARGET_2'
        if reason:
            openp.update({'exit':last,'exit_time':result['timestamp'],'exit_reason':reason,'realized_pct':round((last/openp['entry']-1)*100,2)});closed.append(openp.copy());j['open']=None;j.setdefault('lessons',{})[reason]=j.setdefault('lessons',{}).get(reason,0)+1
    vals=[x.get('realized_pct') or 0 for x in closed[-200:]];wins=sum(x>0 for x in vals);losses=sum(x<0 for x in vals);cum=peak=dd=0
    for x in vals:
        cum+=x;peak=max(peak,cum);dd=min(dd,cum-peak)
    j['stats']={'closed':len(vals),'wins':wins,'losses':losses,'win_rate':round(wins/len(vals)*100,1) if vals else None,'realized_pct':round(sum(vals),2),'max_drawdown_pct':round(dd,2)}
    j['learning_summary']={'lessons':j.get('lessons',{}),'method':'Outcome diagnostics by regime/factor alignment; no self-modifying rules and no claim of certainty.'}
    save(JOURNAL,j);return j
def main():
    ist=now_ist();ts=datetime.now(timezone.utc).isoformat();j=load(JOURNAL,{'open':None,'closed':[],'stats':{},'lessons':{}})
    if not market_open(ist):
        prev=j.get('closed',[])[-1] if j.get('closed') else None
        save(OUT,{'owner':'Rupendra','engine_version':'3.0','timestamp':ts,'ist_time':ist.isoformat(),'market_open':False,'market_status':'MARKET CLOSED','decision':'MARKET CLOSED','decision_type':'SESSION_STATE','signal_strength':0,'model_score':None,'reason':'Trading decisions are generated only during NSE regular derivatives hours, 09:15–15:40 IST, on trading days. Historical decisions remain available as audit only.','previous_decision':prev,'journal_stats':j.get('stats',{}),'learning':j.get('learning_summary',{}),'sources':{'public_market':'scheduled','options':'blocked_until_reliable_chain','news':'public_rss'},'data_quality':{'status':'SESSION_CLOSED'}});return
    m={}
    for k,sym in {'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}.items():
        try:m[k]=market_series(sym)
        except Exception as e:m[k]={'fresh':False,'error':str(e)}
    n=m.get('NIFTY',{});spot=n.get('price');chain=try_option_chain(spot) if spot else {'status':'NO_SPOT'};news_items=news();val=validation();score,reasons,factors=factor_score(m,chain) if spot else (0,['NIFTY spot unavailable'],{})
    cands=option_candidates(chain,spot,'CE')+option_candidates(chain,spot,'PE') if spot else [];cands=sorted(cands,key=lambda x:x['candidate_score'],reverse=True);best=cands[0] if cands else None
    # High selectivity: option chain + price trend + validation + score + liquidity all required.
    option_ok=bool(best and chain.get('status')=='LIVE_PUBLIC_OPTIONS');validation_ok=val.get('hit_rate') is not None and val['hit_rate']>=55;direction='BUY CALL' if score>=4 else 'BUY PUT' if score<=-4 else 'NO TRADE';
    signal_strength=max(0,min(100,round(50+score*7)))
    decision=direction if option_ok and validation_ok and abs(score)>=4 and best['candidate_score']>=65 else 'NO TRADE'
    blockers=[]
    if not option_ok:blockers.append('Reliable live public option chain is unavailable; exact CE/PE is blocked.')
    if not validation_ok:blockers.append('Historical validation threshold is not satisfied.')
    if best and best['candidate_score']<65:blockers.append('Option liquidity/quality score is below threshold.')
    if abs(score)<4:blockers.append('Independent factors are not aligned strongly enough.')
    if decision=='NO TRADE':reason=' | '.join(blockers) if blockers else 'No high-conviction setup passed every gate.'
    else: reason='All required gates passed: price structure, momentum, option quality and historical validation.'
    plan={};
    if decision!='NO TRADE' and best:
        entry=float(best['ask'] or best['last']);atr=n.get('atr14') or entry*.08;plan={'entry':round(entry,2),'stop':round(max(entry*.55,entry-atr*.9),2),'target1':round(entry+atr*.9,2),'target2':round(entry+atr*1.6,2),'risk_reward':round((entry+atr*1.6-entry)/(entry-max(entry*.55,entry-atr*.9)),2),'note':'Use only within the displayed entry zone; invalidate if stop is reached or thesis evidence reverses.'}
    result={'owner':'Rupendra','engine_version':'3.0','timestamp':ts,'ist_time':ist.isoformat(),'market_open':True,'market_status':'MARKET OPEN','decision':decision,'decision_type':'TRADE' if decision!='NO TRADE' else 'ABSTAIN','nifty':spot,'vix':m.get('VIX',{}).get('price'),'regime':'BULLISH' if score>=3 else 'BEARISH' if score<=-3 else 'MIXED','model_score':score,'signal_strength':signal_strength,'reason':reason,'factors':factors,'evidence':reasons,'news':news_items,'validation':val,'option_data':{'status':chain.get('status'),'source':chain.get('source'),'expiry':chain.get('expiry'),'pcr':chain.get('pcr'),'max_pain':chain.get('max_pain'),'contracts':chain.get('count',0),'fresh':chain.get('fresh',False),'errors':chain.get('errors',[])},'candidate':best,'plan':plan,'market':m,'journal_stats':j.get('stats',{}),'learning':j.get('learning_summary',{}),'data_quality':{'status':'PASS' if n.get('fresh') and spot else 'DEGRADED','required_for_trade':['NIFTY','VIX','option_chain','validation','liquidity']}}
    # Append only market-hours decisions; history is never populated by closed-session snapshots.
    hist=load(HISTORY,[]);hist.append({'timestamp':ts,'ist_time':ist.isoformat(),'nifty':spot,'decision':decision,'contract':best.get('contractSymbol') if best else None,'score':score,'signal_strength':signal_strength,'option_status':chain.get('status'),'reason':reason});save(HISTORY,hist[-500:]);j=update_learning(j,result);result['previous_decision']=j.get('closed',[])[-1] if j.get('closed') else None;save(OUT,result)
if __name__=='__main__': main()
