import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests
TZ=ZoneInfo('Asia/Kolkata');OUT='data/learning_state.json';UA={'User-Agent':'Mozilla/5.0 Rupendra-NIFTY-Learning/1.1'}
def chart():
 r=requests.get('https://query1.finance.yahoo.com/v8/finance/chart/^NSEI',params={'interval':'5m','range':'1mo'},headers=UA,timeout=20);r.raise_for_status();z=(r.json().get('chart',{}).get('result') or [None])[0]
 if not z:raise RuntimeError('no historical data')
 q=z['indicators']['quote'][0];return z.get('timestamp',[]),q.get('close',[])
def clean(a):return [float(x) if x is not None else None for x in a]
def ema(a,n):
 a=[x for x in a if x is not None]
 if len(a)<n:return None
 k=2/(n+1);e=sum(a[:n])/n
 for x in a[n:]:e=x*k+e*(1-k)
 return e
def rsi(a,n=14):
 a=[x for x in a if x is not None]
 if len(a)<=n:return None
 g=[];l=[]
 for x,y in zip(a[-n-1:-1],a[-n:]):d=y-x;g.append(max(d,0));l.append(max(-d,0))
 ag,al=sum(g)/n,sum(l)/n
 return 100 if al==0 else 100-100/(1+ag/al)
def main():
 ts,c=chart();c=clean(c);rows=[]
 for i,t in enumerate(ts):
  if i<55 or i+3>=len(c) or c[i] is None:continue
  e20,e50,rr=ema(c[:i],20),ema(c[:i],50),rsi(c[:i])
  if not e20 or not e50 or rr is None:continue
  direction='BULL' if e20>e50 and rr>52 else 'BEAR' if e20<e50 and rr<48 else 'MIXED'
  if direction=='MIXED':continue
  future=c[i+3]-c[i];hit=(direction=='BULL' and future>0) or (direction=='BEAR' and future<0)
  dt=datetime.fromtimestamp(t,timezone.utc).astimezone(TZ);phase='OPEN' if dt.hour==9 and dt.minute<30 else 'MORNING' if dt.hour<11 else 'MIDDAY' if dt.hour<14 else 'CLOSE'
  rows.append((phase,direction,hit))
 phases={};dirs={}
 for phase,direction,hit in rows:
  d=phases.setdefault(phase,{'samples':0,'wins':0});d['samples']+=1;d['wins']+=int(hit)
  d2=dirs.setdefault(direction,{'samples':0,'wins':0});d2['samples']+=1;d2['wins']+=int(hit)
 state={'updated_at':datetime.now(timezone.utc).isoformat(),'window':'1 month of 5-minute NIFTY data','pattern_stats':{k:{**v,'hit_rate':round(v['wins']/v['samples']*100,2) if v['samples'] else None} for k,v in phases.items()},'direction_stats':{k:{**v,'hit_rate':round(v['wins']/v['samples']*100,2) if v['samples'] else None} for k,v in dirs.items()},'learning_rules':['Do not trade during weak or contradictory regimes.','Prefer independent confirmation across trend, momentum, volatility and options.','Use historical hit-rate diagnostics to increase or decrease selectivity, never to guarantee an outcome.','Avoid blindly optimizing on the same data used for validation.'],'note':'Adaptive diagnostics only; the live engine does not self-modify into untested rules.'}
 os.makedirs('data',exist_ok=True);json.dump(state,open(OUT,'w',encoding='utf-8'),indent=2)
if __name__=='__main__':main()
