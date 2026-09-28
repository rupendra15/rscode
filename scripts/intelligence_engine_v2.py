import json, math, os
from datetime import datetime, timezone, time
from zoneinfo import ZoneInfo
import requests
import xml.etree.ElementTree as ET

TZ=ZoneInfo('Asia/Kolkata')
OUT='data/market_snapshot.json'; HISTORY='data/history.json'; JOURNAL='data/trade_journal.json'
UA={'User-Agent':'Mozilla/5.0 (Rupendra NIFTY Intelligence Terminal; research)'}
HOLIDAYS={'2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25'}

def now_ist(): return datetime.now(timezone.utc).astimezone(TZ)
def market_open(dt=None):
    dt=dt or now_ist()
    return dt.weekday()<5 and dt.date().isoformat() not in HOLIDAYS and time(9,15)<=dt.time()<=time(15,40)
def load(p,d):
    try:
        with open(p,encoding='utf-8') as f:return json.load(f)
    except Exception:return d
def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f:json.dump(d,f,indent=2)
def chart(symbol,interval='5m',range_='5d'):
    r=requests.get(f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}',params={'interval':interval,'range':range_},headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('chart',{}).get('result') or [])
    if not z:raise RuntimeError('no chart')
    return z[0]
def clean(a):return [float(x) for x in (a or []) if x is not None]
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
    t=[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,len(c))]
    return sum(t[-n:])/n
def vwap(h,l,c,v):
    pv=vv=0
    for a,b,x,q in zip(h,l,c,v):pv+=(a+b+x)/3*q;vv+=q
    return pv/vv if vv else None
def symbol_data(symbol):
    d=chart(symbol);q=d['indicators']['quote'][0];c=clean(q.get('close'));h=clean(q.get('high'));l=clean(q.get('low'));v=clean(q.get('volume'));ts=d.get('timestamp',[])
    p=c[-1] if c else None;prev=c[-2] if len(c)>1 else None;rr=rsi(c);e20=ema(c,20);e50=ema(c,50);aa=atr(h,l,c);vw=vwap(h[-78:],l[-78:],c[-78:],v[-78:]) if len(c)>=20 else None
    return {'price':round(p,2) if p else None,'change_pct':round((p-prev)/prev*100,2) if p and prev else None,'rsi14':round(rr,2) if rr is not None else None,'ema20':round(e20,2) if e20 is not None else None,'ema50':round(e50,2) if e50 is not None else None,'atr14':round(aa,2) if aa is not None else None,'vwap':round(vw,2) if vw is not None else None,'momentum5m_pct':round((p/c[-6]-1)*100,2) if len(c)>6 else None,'momentum15m_pct':round((p/c[-16]-1)*100,2) if len(c)>16 else None,'volume':int(v[-1]) if v else None,'high_5d':round(max(h),2) if h else None,'low_5d':round(min(l),2) if l else None,'bar_epoch':ts[-1] if ts else None}
def news():
    out=[];seen=set()
    for q in ['NIFTY India markets RBI Fed','India stock market options','India inflation RBI interest rates','India markets crude rupee global']:
        try:
            r=requests.get('https://news.google.com/rss/search',params={'q':q,'hl':'en-IN','gl':'IN','ceid':'IN:en'},headers=UA,timeout=10);root=ET.fromstring(r.text)
            for i in root.findall('./channel/item')[:5]:
                t=i.findtext('title');p=i.findtext('pubDate')
                if t and t not in seen:seen.add(t);out.append({'title':t,'published':p})
        except Exception:pass
    return out[:12]
def cdf(x):return .5*(1+math.erf(x/math.sqrt(2)))
def delta(spot,strike,iv,days,kind):
    if not iv or not days or spot<=0 or strike<=0:return None
    t=max(days/365,.00274)
    try:
        d1=(math.log(spot/strike)+(.065+.5*iv*iv)*t)/(iv*math.sqrt(t))
        return cdf(d1) if kind=='CE' else cdf(d1)-1
    except Exception:return None
def option_chain(spot):
    base='https://query1.finance.yahoo.com/v7/finance/options/%5ENSEI';r=requests.get(base,headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('optionChain',{}).get('result') or [None])[0]
    if not z:raise RuntimeError('option chain unavailable')
    exp=int((z.get('expirationDates') or [0])[0]);r=requests.get(f'{base}&date={exp}',headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('optionChain',{}).get('result') or [None])[0]
    if not z:raise RuntimeError('empty option chain')
    raw=z.get('options',[{}])[0];calls=raw.get('calls',[]);puts=raw.get('puts',[]);allc=calls+puts
    call_oi=sum(x.get('openInterest') or 0 for x in calls);put_oi=sum(x.get('openInterest') or 0 for x in puts);pcr=put_oi/call_oi if call_oi else None
    strikes=sorted(set(x.get('strike') for x in allc if x.get('strike') is not None));maxpain=None
    if strikes:
        pains=[]
        for s in strikes:
            pain=sum(max(0,s-x.get('strike',0))*(x.get('openInterest') or 0) for x in calls)+sum(max(0,x.get('strike',0)-s)*(x.get('openInterest') or 0) for x in puts);pains.append((pain,s))
        maxpain=min(pains)[1]
    days=max((exp-datetime.now(timezone.utc).timestamp())/86400,.5);by_symbol={x.get('contractSymbol'):x for x in allc if x.get('contractSymbol')}
    return {'expiry_epoch':exp,'expiry_utc':datetime.fromtimestamp(exp,timezone.utc).isoformat(),'calls':calls,'puts':puts,'by_symbol':by_symbol,'pcr':round(pcr,3) if pcr is not None else None,'max_pain':maxpain,'days':days}
def candidate(chain,spot,kind):
    side=chain['calls'] if kind=='CALL' else chain['puts'];cand=[]
    for x in side:
        strike=x.get('strike');last=x.get('lastPrice');bid=x.get('bid');ask=x.get('ask');oi=x.get('openInterest') or 0;vol=x.get('volume') or 0;iv=x.get('impliedVolatility') or 0
        if not strike or not last or not bid or not ask or ask<=bid or oi<500 or vol<100 or iv<=0:continue
        spr=(ask-bid)/((ask+bid)/2)
        if spr>.12 or abs(strike-spot)>max(700,spot*.035):continue
        d=delta(spot,strike,iv,chain['days'],'CE' if kind=='CALL' else 'PE')
        if d is None:continue
        target=.45 if kind=='CALL' else -.45;fit=max(0,1-abs(d-target)/.35);liq=min(1,math.log10(1+vol)/6)*.5+min(1,math.log10(1+oi)/7)*.5;sp=max(0,1-spr/.12);dist=max(0,1-abs(strike-spot)/(spot*.035));sc=100*(.4*fit+.3*liq+.2*sp+.1*dist)
        cand.append((sc,x,d,spr))
    if not cand:return None
    cand.sort(key=lambda x:x[0],reverse=True);sc,x,d,spr=cand[0]
    return {'candidate_score':round(sc,1),'contractSymbol':x.get('contractSymbol'),'strike':x.get('strike'),'last':x.get('lastPrice'),'bid':x.get('bid'),'ask':x.get('ask'),'volume':x.get('volume') or 0,'oi':x.get('openInterest') or 0,'iv':x.get('impliedVolatility'),'delta_est':round(d,3),'spread_pct':round(spr*100,2),'side':'CE' if kind=='CALL' else 'PE'}
def score(m):
    n=m.get('NIFTY',{});v=m.get('VIX',{});s=0;r=[]
    if not n.get('price'):return 0,r
    if n.get('ema20') and n.get('ema50'):
        if n['price']>n['ema20']>n['ema50']:s+=2;r.append('Trend: price above EMA20 above EMA50')
        elif n['price']<n['ema20']<n['ema50']:s-=2;r.append('Trend: price below EMA20 below EMA50')
    if n.get('rsi14') is not None:
        if n['rsi14']>=55:s+=1.5;r.append('RSI confirms bullish momentum')
        elif n['rsi14']<=45:s-=1.5;r.append('RSI confirms bearish momentum')
    for k,t in [('momentum5m_pct',.12),('momentum15m_pct',.25)]:
        x=n.get(k)
        if x is not None:s+=(1 if x>t else -1 if x<-t else 0)
    if n.get('vwap') is not None:s+=1 if n['price']>n['vwap'] else -1;r.append('Price above VWAP' if n['price']>n['vwap'] else 'Price below VWAP')
    if v.get('change_pct') is not None and n.get('change_pct') is not None:
        if v['change_pct']>5 and n['change_pct']<0:s-=1;r.append('VIX rising with NIFTY weakness')
        elif v['change_pct']<-5 and n['change_pct']>0:s+=1;r.append('VIX falling with NIFTY strength')
    for k in ['SPX','NASDAQ']:
        x=m.get(k,{}).get('change_pct');s+=(.5 if x is not None and x>.25 else -.5 if x is not None and x<-.25 else 0)
    return round(s,2),r
def validation():
    try:
        c=clean(chart('^NSEI')['indicators']['quote'][0].get('close'));hits=samples=0
        for i in range(60,len(c)-3):
            e20,e50=ema(c[:i],20),ema(c[:i],50);rr=rsi(c[:i]);d=1 if e20 and e50 and rr and e20>e50 and rr>52 else -1 if e20 and e50 and rr and e20<e50 and rr<48 else 0
            if not d:continue
            samples+=1;f=c[i+3]-c[i];hits+=int((d>0 and f>0) or (d<0 and f<0))
        return {'samples':samples,'hit_rate':round(hits/samples*100,1) if samples else None,'method':'5d 5m EMA20/EMA50 + RSI, 15m forward direction'}
    except Exception:return {'samples':0,'hit_rate':None,'method':'validation unavailable'}
def update_journal(j,res,chain):
    now=res['timestamp'];openp=j.get('open');closed=j.setdefault('closed',[]);candidate=res.get('candidate')
    if openp:
        q=(chain or {}).get('by_symbol',{}).get(openp.get('symbol'))
        if q and q.get('lastPrice') is not None:
            last=float(q['lastPrice']);openp['last']=last;openp['unrealized_pct']=round((last/openp['entry']-1)*100,2);reason=None
            if last<=openp['stop']:reason='STOP_LOSS'
            elif last>=openp['target2']:reason='TARGET_2'
            elif now[:10]==openp['time'][:10] and now_ist().time()>=time(15,35):reason='MARKET_CLOSE'
            if reason:
                openp.update({'exit':last,'exit_time':now,'exit_reason':reason,'realized_pct':round((last/openp['entry']-1)*100,2)});closed.append(openp.copy());j['open']=None
                lp=j.setdefault('learning',{});lp[reason]=lp.get(reason,0)+1
    if not j.get('open') and res['decision'] in ('BUY CALL','BUY PUT') and candidate:
        e=float(candidate['ask'] or candidate['last']);j['open']={'time':now,'symbol':candidate['contractSymbol'],'side':candidate['side'],'entry':e,'last':e,'stop':round(e*.70,2),'target1':round(e*1.30,2),'target2':round(e*1.60,2),'model_score':res['model_score'],'signal_strength':res['signal_strength']}
    closed=j['closed'][-200:];wins=sum((x.get('realized_pct') or 0)>0 for x in closed);losses=sum((x.get('realized_pct') or 0)<0 for x in closed);total=sum(x.get('realized_pct') or 0 for x in closed);peak=0;dd=0;cum=0
    for x in closed:
        cum+=x.get('realized_pct') or 0;peak=max(peak,cum);dd=min(dd,cum-peak)
    j['stats']={'closed':len(closed),'wins':wins,'losses':losses,'win_rate':round(wins/len(closed)*100,1) if closed else None,'realized_pct':round(total,2),'max_drawdown_pct':round(dd,2)}
    j['learning_summary']={'lessons':j.get('learning',{}),'rule':'Learning is diagnostic: future trades remain blocked unless independent data gates pass.'}
    save(JOURNAL,j);return j
def main():
    ist=now_ist();ts=datetime.now(timezone.utc).isoformat();open_now=market_open(ist)
    if not open_now:
        prev=load(JOURNAL,{'open':None,'closed':[],'stats':{}})
        save(OUT,{'owner':'Rupendra','timestamp':ts,'ist_time':ist.isoformat(),'market_open':False,'market_status':'MARKET CLOSED','decision':'MARKET CLOSED','signal_strength':0,'model_score':None,'reason':'NIFTY option decisions are generated only during NSE regular derivatives hours, 09:15–15:40 IST, on trading days.','source_quality':'PUBLIC_RESEARCH_FEEDS','live_broker_feed':False,'journal_stats':prev.get('stats',{}),'learning':prev.get('learning_summary',{}),'previous_decision':prev.get('closed',[])[-1] if prev.get('closed') else None});return
    m={}
    for k,sym in {'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}.items():
        try:m[k]=symbol_data(sym)
        except Exception as e:m[k]={'error':type(e).__name__}
    n=m.get('NIFTY',{});s,reasons=score(m);reg='UP' if s>=2.5 else 'DOWN' if s<=-2.5 else 'NEUTRAL';val=validation();chain=None;candidate=None;chain_error=None
    if n.get('price'):
        try:chain=option_chain(n['price']);candidate=candidate(chain,n['price'],'CALL' if s>0 else 'PUT')
        except Exception as e:chain_error=type(e).__name__
    complete=all(m.get(k,{}).get('price') is not None for k in ['NIFTY','VIX','SPX','NASDAQ','USDINR','CRUDE','GOLD']);valid=val.get('samples',0)>=30;decision='NO TRADE';blocks=[]
    if not complete:blocks.append('core market data incomplete')
    if not chain:blocks.append('option chain unavailable')
    if not candidate:blocks.append('no option passed liquidity/spread/strike filters')
    if abs(s)<5:blocks.append(f'model score {s} is below ±5')
    if candidate and candidate['candidate_score']<75:blocks.append('option quality below 75/100')
    if not valid:blocks.append('validation sample insufficient')
    if complete and chain and candidate and abs(s)>=5 and candidate['candidate_score']>=75 and valid:decision='BUY CALL' if s>0 else 'BUY PUT'
    strength=min(99,max(0,int(50+abs(s)*5)))
    reason=(f'{decision}: {candidate["contractSymbol"]}; entry uses ask; score {s}; option quality {candidate["candidate_score"]}/100; validation {val.get("hit_rate")}%. ' if decision!='NO TRADE' else 'NO TRADE — '+'; '.join(blocks)+'.')
    plan=None
    if decision!='NO TRADE':
        e=float(candidate['ask'] or candidate['last']);plan={'entry':e,'stop':round(e*.70,2),'target1':round(e*1.30,2),'target2':round(e*1.60,2),'note':'Defined research plan; public option quote may be delayed.'}
    j=load(JOURNAL,{'open':None,'closed':[],'learning':{}});res={'owner':'Rupendra','timestamp':ts,'ist_time':ist.isoformat(),'market_open':True,'market_status':'MARKET OPEN','source_quality':'PUBLIC_RESEARCH_FEEDS','live_broker_feed':False,'decision':decision,'signal_strength':strength,'model_score':s,'reason':reason,'nifty':n.get('price'),'vix':m.get('VIX',{}).get('price'),'regime':reg,'market':m,'evidence':reasons,'news':news(),'validation':val,'option_data':{'status':'READY' if chain else 'UNAVAILABLE','source':'Yahoo Finance public options data (delayed; not exchange-direct)' if chain else None,'delay_note':'Not tick-by-tick exchange data.' if chain else chain_error},'option_analysis':{'pcr':chain.get('pcr') if chain else None,'max_pain':chain.get('max_pain') if chain else None,'expiry_utc':chain.get('expiry_utc') if chain else None,'candidate':candidate,'status':'READY' if candidate else 'UNAVAILABLE'},'candidate':candidate,'plan':plan}
    j=update_journal(j,res,chain);res['journal_stats']=j.get('stats',{});res['learning']=j.get('learning_summary',{});res['open_position']=j.get('open');res['previous_decision']=j.get('closed',[])[-1] if j.get('closed') else None
    hist=load(HISTORY,[]);hist.append({'timestamp':ts,'ist_time':ist.isoformat(),'nifty':n.get('price'),'regime':reg,'score':s,'decision':decision,'contract':(candidate or {}).get('contractSymbol'),'signal_strength':strength,'reason':reason,'pnl_pct':(j.get('closed',[])[-1].get('realized_pct') if j.get('closed') else None)});save(HISTORY,hist[-500:]);save(OUT,res)
if __name__=='__main__':main()
