import json, os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

OUT='data/market_snapshot.json'; JOURNAL='data/trade_journal.json'; HISTORY='data/history.json'
TZ=ZoneInfo('Asia/Kolkata')

def load(p,d):
    try:
        with open(p,encoding='utf-8') as f:return json.load(f)
    except Exception:return d

def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,'w',encoding='utf-8') as f:json.dump(d,f,indent=2)

def now():return datetime.now(timezone.utc).isoformat()

def update():
    snap=load(OUT,{})
    j=load(JOURNAL,{'open':None,'closed':[],'stats':{},'lessons':{}})
    hist=load(HISTORY,[])
    # History is a trading-decision audit, never a list of market-closed heartbeats.
    hist=[x for x in hist if x.get('decision') not in ('MARKET CLOSED','SESSION_STATE')]
    cand=snap.get('candidate') or {}
    plan=snap.get('plan') or {}
    market=bool(snap.get('market_open'))
    action=snap.get('decision')
    price=cand.get('last') or cand.get('ask')
    openp=j.get('open')

    # Start one paper/audit position only when a fully validated recommendation exists.
    if market and action in ('BUY CALL','BUY PUT') and cand.get('contractSymbol') and price and plan.get('entry'):
        sym=cand['contractSymbol']
        if openp is None:
            j['open']={'symbol':sym,'action':action,'entry':float(plan['entry']),'last':float(price),'stop':float(plan.get('stop')) if plan.get('stop') is not None else None,'target1':float(plan.get('target1')) if plan.get('target1') is not None else None,'target2':float(plan.get('target2')) if plan.get('target2') is not None else None,'opened_at':now(),'signal_score':snap.get('model_score'),'confidence':snap.get('confidence'),'contract':sym,'status':'OPEN'}
        elif openp.get('symbol')==sym:
            openp['last']=float(price)
            openp['unrealized_pct']=round((float(price)/openp['entry']-1)*100,2)
        elif openp is not None and openp.get('symbol')!=sym:
            # A validated reversal closes the prior audit position at the latest available quote.
            if price:
                openp.update({'exit':float(price),'exit_time':now(),'exit_reason':'SIGNAL_REVERSAL','realized_pct':round((float(price)/openp['entry']-1)*100,2),'status':'CLOSED'})
                j.setdefault('closed',[]).append(openp.copy());j.setdefault('lessons',{})['SIGNAL_REVERSAL']=j.setdefault('lessons',{}).get('SIGNAL_REVERSAL',0)+1
            j['open']=None

    openp=j.get('open')
    if openp is not None and price:
        openp['last']=float(price);openp['unrealized_pct']=round((float(price)/openp['entry']-1)*100,2)
        stop=openp.get('stop');t1=openp.get('target1');t2=openp.get('target2');reason=None
        if stop is not None and float(price)<=stop:reason='STOP_LOSS'
        elif t2 is not None and float(price)>=t2:reason='TARGET_2'
        elif market is False and snap.get('market_status')=='MARKET CLOSED':reason='MARKET_CLOSE'
        if reason:
            openp.update({'exit':float(price),'exit_time':now(),'exit_reason':reason,'realized_pct':round((float(price)/openp['entry']-1)*100,2),'status':'CLOSED'})
            j.setdefault('closed',[]).append(openp.copy());j.setdefault('lessons',{})[reason]=j.setdefault('lessons',{}).get(reason,0)+1;j['open']=None

    vals=[float(x.get('realized_pct') or 0) for x in j.get('closed',[])][-500:]
    wins=sum(x>0 for x in vals);losses=sum(x<0 for x in vals);cum=peak=dd=0
    for x in vals:
        cum+=x;peak=max(peak,cum);dd=min(dd,cum-peak)
    j['stats']={'closed':len(vals),'wins':wins,'losses':losses,'win_rate':round(wins/len(vals)*100,1) if vals else None,'realized_pct':round(sum(vals),2),'max_drawdown_pct':round(dd,2)}
    j['learning_summary']={'lessons':j.get('lessons',{}),'last_updated':now(),'method':'Outcome audit by validated signal, exit reason, market regime and option-contract liquidity. No self-modifying rule is allowed to silently change live criteria.'}
    save(JOURNAL,j)
    if j.get('closed'):snap['previous_decision']=j['closed'][-1]
    snap['journal_stats']=j['stats'];snap['learning']=j['learning_summary'];snap['open_trade']=j.get('open')
    save(OUT,snap);save(HISTORY,hist[-500:])

if __name__=='__main__':update()
