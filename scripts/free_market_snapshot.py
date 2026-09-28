import json, math, os
from datetime import datetime, timezone
import requests
import xml.etree.ElementTree as ET

UA={'User-Agent':'Mozilla/5.0 (Rupendra NIFTY Intelligence Terminal; research)'}
OUT='data/market_snapshot.json'; HISTORY='data/history.json'; JOURNAL='data/trade_journal.json'

def chart(symbol,interval='5m',range_='5d'):
    r=requests.get(f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}',params={'interval':interval,'range':range_},headers=UA,timeout=20); r.raise_for_status(); z=(r.json().get('chart',{}).get('result') or [])
    if not z: raise RuntimeError('no chart'); return z[0]

def clean(a): return [float(x) for x in a if x is not None]
def ema(a,n):
    if len(a)<n:return None
    k=2/(n+1); e=sum(a[:n])/n
    for x in a[n:]:e=x*k+e*(1-k)
    return e
def rsi(a,n=14):
    if len(a)<=n:return None
    g=[];l=[]
    for x,y in zip(a[-n-1:-1],a[-n:]):d=y-x;g.append(max(d,0));l.append(max(-d,0))
    ag,al=sum(g)/n,sum(l)/n;return 100 if al==0 else 100-100/(1+ag/al)
def atr(h,l,c,n=14):
    if len(c)<=n:return None
    t=[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,len(c))];return sum(t[-n:])/n
def vwap(h,l,c,v):
    pv=vv=0
    for a,b,x,q in zip(h,l,c,v):pv+=(a+b+x)/3*q;vv+=q
    return pv/vv if vv else None
def symbol_data(symbol):
    d=chart(symbol);q=d['indicators']['quote'][0];c=clean(q.get('close',[]));h=clean(q.get('high',[]));l=clean(q.get('low',[]));v=clean(q.get('volume',[]));ts=d.get('timestamp',[]);p=c[-1] if c else None;prev=c[-2] if len(c)>1 else None
    return {'price':round(p,2) if p else None,'change_pct':round((p-prev)/prev*100,2) if p and prev else None,'rsi14':round(rsi(c),2) if rsi(c)!=None else None,'ema20':round(ema(c,20),2) if ema(c,20)!=None else None,'ema50':round(ema(c,50),2) if ema(c,50)!=None else None,'atr14':round(atr(h,l,c),2) if atr(h,l,c)!=None else None,'vwap':round(vwap(h[-78:],l[-78:],c[-78:],v[-78:]),2) if len(c)>=20 and vwap(h[-78:],l[-78:],c[-78:],v[-78:]) else None,'momentum5m_pct':round((p/c[-6]-1)*100,2) if len(c)>6 else None,'momentum15m_pct':round((p/c[-16]-1)*100,2) if len(c)>16 else None,'volume':int(v[-1]) if v else None,'high_5d':round(max(h),2) if h else None,'low_5d':round(min(l),2) if l else None,'bar_epoch':ts[-1] if ts else None}

def news():
    out=[];seen=set()
    for q in ['NIFTY India markets RBI Fed','India stock market options','India inflation RBI interest rates','India markets crude rupee global']:
        try:
            r=requests.get('https://news.google.com/rss/search',params={'q':q,'hl':'en-IN','gl':'IN','ceid':'IN:en'},headers=UA,timeout=10);root=ET.fromstring(r.text)
            for i in root.findall('./channel/item')[:5]:
                t=i.findtext('title');p=i.findtext('pubDate')
                if t and t not in seen:seen.add(t);out.append({'title':t,'published':p})
        except Exception:pass
    return out[:15]

def cdf(x):return .5*(1+math.erf(x/math.sqrt(2)))
def delta(spot,strike,iv,days,kind):
    if not iv or not days or spot<=0 or strike<=0:return None
    t=max(days/365,.00274)
    try:d1=(math.log(spot/strike)+(.065+.5*iv*iv)*t)/(iv*math.sqrt(t));return cdf(d1) if kind=='CE' else cdf(d1)-1
    except Exception:return None

def options(spot,kind):
    base='https://query2.finance.yahoo.com/v7/finance/options/%5ENSEI';r=requests.get(base,headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('optionChain',{}).get('result') or [None])[0]
    if not z:raise RuntimeError('option chain unavailable')
    exp=int((z.get('expirationDates') or [0])[0]);r=requests.get(f'{base}&date={exp}',headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('optionChain',{}).get('result') or [None])[0]
    if not z:raise RuntimeError('empty option chain')
    raw=z.get('options',[{}])[0];calls=raw.get('calls',[]);puts=raw.get('puts',[]);side=calls if kind=='CALL' else puts
    allc=calls+puts;pcr=(sum((x.get('openInterest') or 0) for x in puts)/sum((x.get('openInterest') or 0) for x in calls)) if sum((x.get('openInterest') or 0) for x in calls) else None
    strikes=sorted(set(x.get('strike') for x in allc if x.get('strike') is not None));mp=None
    if strikes:
        pains=[]
        for s in strikes:
            pain=sum(max(0,s-x.get('strike',0))*(x.get('openInterest') or 0) for x in calls)+sum(max(0,x.get('strike',0)-s)*(x.get('openInterest') or 0) for x in puts);pains.append((pain,s))
        mp=min(pains)[1]
    days=max((exp-datetime.now(timezone.utc).timestamp())/86400,.5);cand=[]
    for x in side:
        strike=x.get('strike');last=x.get('lastPrice');bid=x.get('bid');ask=x.get('ask');oi=x.get('openInterest') or 0;vol=x.get('volume') or 0;iv=x.get('impliedVolatility') or 0
        if not strike or not last or not bid or not ask or ask<=bid or oi<500 or vol<100 or iv<=0:continue
        spr=(ask-bid)/((ask+bid)/2)
        if spr>.15 or abs(strike-spot)>max(800,spot*.045):continue
        d=delta(spot,strike,iv,days,'CE' if kind=='CALL' else 'PE')
        if d is None:continue
        target=.45 if kind=='CALL' else -.45;fit=max(0,1-abs(d-target)/.35);liq=min(1,math.log10(1+vol)/6)*.5+min(1,math.log10(1+oi)/7)*.5;sp=max(0,1-spr/.15);dist=max(0,1-abs(strike-spot)/(spot*.045));sc=100*(.4*fit+.25*liq+.2*sp+.15*dist)
        cand.append((sc,x,d,spr))
    if not cand:return {'status':'UNAVAILABLE','reason':'No liquid option passed filters.','pcr':pcr,'max_pain':mp}
    cand.sort(key=lambda x:x[0],reverse=True);sc,x,d,spr=cand[0]
    return {'status':'READY','source':'Yahoo Finance public options data (delayed; not exchange-direct)','expiry_epoch':exp,'expiry_utc':datetime.fromtimestamp(exp,timezone.utc).isoformat(),'pcr':round(pcr,3) if pcr else None,'max_pain':mp,'candidate_score':round(sc,1),'candidate':{'contractSymbol':x.get('contractSymbol'),'strike':x.get('strike'),'last':x.get('lastPrice'),'bid':x.get('bid'),'ask':x.get('ask'),'volume':x.get('volume') or 0,'oi':x.get('openInterest') or 0,'iv':x.get('impliedVolatility'),'delta_est':round(d,3),'spread_pct':round(spr*100,2),'side':'CE' if kind=='CALL' else 'PE'},'delay_note':'Public Yahoo option quotes are delayed; this is not tick-by-tick exchange data.'}

def score(m):
    n=m.get('NIFTY',{});v=m.get('VIX',{});s=0;r=[]
    if not n.get('price'):return 0,r
    if n.get('ema20') and n.get('ema50'):
        if n['price']>n['ema20']>n['ema50']:s+=2;r.append('Price > EMA20 > EMA50')
        elif n['price']<n['ema20']<n['ema50']:s-=2;r.append('Price < EMA20 < EMA50')
    if n.get('rsi14') is not None:
        if n['rsi14']>=55:s+=1.5;r.append('RSI bullish')
        elif n['rsi14']<=45:s-=1.5;r.append('RSI bearish')
    for k,t in [('momentum5m_pct',.12),('momentum15m_pct',.25)]:
        x=n.get(k)
        if x is not None:s+=(1 if x>t else -1 if x<-t else 0)
    if n.get('vwap') is not None:s+=1 if n['price']>n['vwap'] else -1;r.append('Above VWAP' if n['price']>n['vwap'] else 'Below VWAP')
    if v.get('change_pct') is not None and n.get('change_pct') is not None:
        if v['change_pct']>5 and n['change_pct']<0:s-=1;r.append('VIX rising with NIFTY weakness')
        elif v['change_pct']<-5 and n['change_pct']>0:s+=1;r.append('VIX falling with NIFTY strength')
    for k in ['SPX','NASDAQ']:
        x=m.get(k,{}).get('change_pct');s+=(.5 if x is not None and x>.25 else -.5 if x is not None and x<-.25 else 0)
    return round(s,2),r

def validation():
    try:
        c=clean(chart('^NSEI')['indicators']['quote'][0].get('close',[]));hits=samples=0
        for i in range(60,len(c)-3):
            e20,e50=ema(c[:i],20),ema(c[:i],50);rr=rsi(c[:i]);d=1 if e20 and e50 and rr and e20>e50 and rr>52 else -1 if e20 and e50 and rr and e20<e50 and rr<48 else 0
            if not d:continue
            samples+=1;f=c[i+3]-c[i];hits+=int((d>0 and f>0) or (d<0 and f<0))
        return {'samples':samples,'hit_rate':round(hits/samples*100,1) if samples else None,'method':'5d 5m EMA20/EMA50 + RSI; 15m forward direction'}
    except Exception:return {'samples':0,'hit_rate':None,'method':'validation unavailable'}

def load(p,d):
    try:
        with open(p,encoding='utf-8') as f:return json.load(f)
    except Exception:return d
def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f:json.dump(d,f,indent=2)

def journal(res):
    j=load(JOURNAL,{'open':None,'closed':[]});c=(res.get('option_analysis') or {}).get('candidate');now=res['timestamp']
    if j.get('open') and c and c.get('last'):
        o=j['open'];o['last']=c['last'];o['unrealized_pct']=round((c['last']/o['entry']-1)*100,2);reason=None
        if c['last']<=o['stop']:reason='stop'
        elif c['last']>=o['target2']:reason='target2'
        if reason:
            o.update({'exit':c['last'],'exit_time':now,'exit_reason':reason,'realized_pct':round((c['last']/o['entry']-1)*100,2)});j['closed'].append(o);j['closed']=j['closed'][-200:];j['open']=None
    if not j.get('open') and res['decision'] in ('BUY CALL','BUY PUT') and c and c.get('ask'):
        e=c['ask'];j['open']={'time':now,'symbol':c['contractSymbol'],'side':c['side'],'entry':e,'last':e,'stop':round(e*.72,2),'target1':round(e*1.30,2),'target2':round(e*1.60,2)}
    j['stats']={'closed':len(j['closed']),'wins':sum((x.get('realized_pct') or 0)>0 for x in j['closed']),'losses':sum((x.get('realized_pct') or 0)<0 for x in j['closed']),'realized_pct':round(sum(x.get('realized_pct') or 0 for x in j['closed']),2)};save(JOURNAL,j);return j

def main():
    now=datetime.now(timezone.utc).isoformat();m={}
    for k,s in {'NIFTY':'^NSEI','VIX':'^INDIAVIX','SPX':'^GSPC','NASDAQ':'^IXIC','USDINR':'INR=X','CRUDE':'CL=F','GOLD':'GC=F'}.items():
        try:m[k]=symbol_data(s)
        except Exception as e:m[k]={'error':type(e).__name__}
    n=m.get('NIFTY',{});s,reasons=score(m);reg='UP' if s>=2.5 else 'DOWN' if s<=-2.5 else 'NEUTRAL';val=validation();oa=None
    if n.get('price'):
        try:oa=options(n['price'],'CALL' if s>0 else 'PUT')
        except Exception as e:oa={'status':'UNAVAILABLE','reason':type(e).__name__}
    cand=(oa or {}).get('candidate');complete=all(m.get(k,{}).get('price') is not None for k in ['NIFTY','VIX','SPX','NASDAQ','USDINR','CRUDE','GOLD']);ready=(oa or {}).get('status')=='READY' and cand is not None;valid=val.get('samples',0)>=30
    decision='NO TRADE';reason=[]
    if not complete:reason.append('core market data incomplete')
    if not ready:reason.append('usable option chain unavailable')
    if abs(s)<5:reason.append(f'model score {s} below ±5 gate')
    if ready and cand.get('candidate_score',0)<72:reason.append('option quality gate failed')
    if not valid:reason.append('validation sample insufficient')
    if complete and ready and abs(s)>=5 and cand.get('candidate_score',0)>=72 and valid:decision='BUY CALL' if s>0 else 'BUY PUT'
    else:reason=['NO TRADE — '+ '; '.join(reason)+'.']
    if decision!='NO TRADE':reason=[f'{decision}: score {s}; contract quality {cand["candidate_score"]}/100; research hit rate {val.get("hit_rate")}% on {val.get("samples")} samples.']
    plan=None
    if decision!='NO TRADE':
        e=cand.get('ask') or cand.get('last');plan={'entry':e,'stop':round(e*.72,2),'target1':round(e*1.30,2),'target2':round(e*1.60,2),'note':'Research plan using delayed public option quote.'}
    r={'generated_at':now,'timestamp':now,'owner':'Rupendra','source_quality':'PUBLIC_RESEARCH_FEEDS','live_broker_feed':False,'decision':decision,'signal_strength':min(99,int(50+abs(s)*5)),'model_score':s,'reason':' '.join(reason),'nifty':n.get('price'),'vix':m.get('VIX',{}).get('price'),'regime':reg,'market':m,'evidence':reasons,'news':news(),'option_data':{'status':oa.get('status') if oa else 'BLOCKED','source':oa.get('source') if oa else None,'delay_note':oa.get('delay_note') if oa else None},'option_analysis':oa,'contract':(cand or {}).get('contractSymbol') if decision!='NO TRADE' else None,'plan':plan,'validation':val,'data_quality':{'core_complete':complete,'options_ready':ready,'news_count':len(news())}}
    j=journal(r);r['journal']=j;r['pnl']=j.get('open');hist=load(HISTORY,[]);hist.append({'timestamp':now,'nifty':r['nifty'],'vix':r['vix'],'regime':reg,'score':s,'decision':decision,'contract':r['contract']});save(HISTORY,hist[-500:]);r['history_size']=len(hist[-500:]);save(OUT,r)
if __name__=='__main__':main()
