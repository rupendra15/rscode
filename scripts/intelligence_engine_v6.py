import json, math, os, statistics
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests
import xml.etree.ElementTree as ET
import intelligence_engine_v3 as v3

TZ=ZoneInfo("Asia/Kolkata")
OUT="data/market_snapshot.json"; HISTORY="data/history.json"; JOURNAL="data/trade_journal.json"
UA={**v3.UA,"Accept":"application/json,text/plain,*/*","Referer":"https://www.nseindia.com/"}

def save(p,d):
    os.makedirs(os.path.dirname(p),exist_ok=True)
    with open(p,"w",encoding="utf-8") as f: json.dump(d,f,indent=2)

def clean(x): return [float(v) for v in (x or []) if v is not None]

def sma(a,n): return sum(a[-n:])/n if len(a)>=n else None
def stdev(a): return statistics.stdev(a) if len(a)>1 else 0
def roc(a,n): return (a[-1]/a[-1-n]-1)*100 if len(a)>n and a[-1-n] else None

def macd(a):
    e12=v3.ema(a,12); e26=v3.ema(a,26)
    if e12 is None or e26 is None:return None
    return e12-e26

def adx(h,l,c,n=14):
    if len(c)<n*2+1:return None
    tr=[];plus=[];minus=[]
    for i in range(1,len(c)):
        tr.append(max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])))
        up=h[i]-h[i-1];dn=l[i-1]-l[i]
        plus.append(up if up>dn and up>0 else 0);minus.append(dn if dn>up and dn>0 else 0)
    atr=sum(tr[-n:])/n
    if atr<=0:return None
    p=100*(sum(plus[-n:])/n)/atr;m=100*(sum(minus[-n:])/n)/atr
    return 100*abs(p-m)/(p+m) if p+m else 0

def bollinger(a,n=20,k=2):
    if len(a)<n:return None,None,None
    m=sma(a,n);sd=stdev(a[-n:]);return m+k*sd,m,m-k*sd

def candle_patterns(o,h,l,c):
    if len(c)<5:return []
    out=[];i=-1;body=abs(c[i]-o[i]);rng=max(h[i]-l[i],1e-9);upper=h[i]-max(o[i],c[i]);lower=min(o[i],c[i])-l[i]
    if body/rng<.1:out.append("doji")
    if lower>=2*max(body,1e-9) and upper<=body:out.append("hammer")
    if upper>=2*max(body,1e-9) and lower<=body:out.append("shooting_star")
    prev_body=abs(c[-2]-o[-2])
    if c[-2]<o[-2] and c[-1]>o[-1] and c[-1]>=o[-2] and o[-1]<=c[-2]:out.append("bullish_engulfing")
    if c[-2]>o[-2] and c[-1]<o[-1] and c[-1]<=o[-2] and o[-1]>=c[-2]:out.append("bearish_engulfing")
    if len(c)>=3:
        if c[-3]<o[-3] and c[-2]<o[-2] and c[-1]>o[-1] and c[-1]>(o[-3]+c[-3])/2:out.append("morning_star_like")
        if c[-3]>o[-3] and c[-2]>o[-2] and c[-1]<o[-1] and c[-1]<(o[-3]+c[-3])/2:out.append("evening_star_like")
    return out

def classical_patterns(o,h,l,c):
    if len(c)<30:return []
    out=[]
    hi=max(h[-21:-1]);lo=min(l[-21:-1]);last=c[-1]
    if last>hi:out.append("breakout")
    if last<lo:out.append("breakdown")
    # Double top/bottom: two local extremes within 0.35% followed by rejection/confirmation.
    left_hi=max(h[-20:-10]);right_hi=max(h[-10:-2])
    left_lo=min(l[-20:-10]);right_lo=min(l[-10:-2])
    if abs(left_hi-right_hi)/max(last,1)<.0035 and last<min(left_hi,right_hi)*.998:out.append("double_top_candidate")
    if abs(left_lo-right_lo)/max(last,1)<.0035 and last>max(left_lo,right_lo)*1.002:out.append("double_bottom_candidate")
    # Range/triangle compression.
    ranges=[h[i]-l[i] for i in range(-12,0)]
    if len(ranges)==12 and sum(ranges[-4:])/4 < sum(ranges[:4])/4*.75:out.append("volatility_compression")
    # Flags/pennants represented conservatively as trend impulse + compression.
    if len(c)>=15 and abs(roc(c,10) or 0)>.7 and out.count("volatility_compression"):out.append("flag_pennant_candidate")
    # Wedge/triangle proxy using narrowing high-low envelope.
    hi1=max(h[-20:-10]);hi2=max(h[-10:]);lo1=min(l[-20:-10]);lo2=min(l[-10:])
    if hi2<hi1 and lo2>lo1:out.append("converging_triangle_candidate")
    return out

def structure(o,h,l,c):
    e20=v3.ema(c,20);e50=v3.ema(c,50);e200=v3.ema(c,200);r=v3.rsi(c);a=v3.atr(h,l,c);m=macd(c);bb=bollinger(c);d=adx(h,l,c)
    pats=candle_patterns(o,h,l,c)+classical_patterns(o,h,l,c)
    return {"ema9":v3.ema(c,9),"ema20":e20,"ema50":e50,"ema200":e200,"rsi14":r,"atr14":a,"macd":m,"adx14":d,
      "bb_upper":bb[0],"bb_mid":bb[1],"bb_lower":bb[2],"momentum1m":roc(c,1),"momentum5":roc(c,5),
      "momentum15":roc(c,15),"momentum30":roc(c,30),"patterns":pats,
      "support_20":min(l[-20:]),"resistance_20":max(h[-20:]),"support_50":min(l[-50:]),"resistance_50":max(h[-50:])}

def nse_index_breadth():
    try:
        s=requests.Session();s.headers.update(UA);s.get("https://www.nseindia.com/",timeout=10)
        r=s.get("https://www.nseindia.com/api/equity-stockIndices",params={"index":"NIFTY 50"},timeout=12);r.raise_for_status();z=r.json()
        rows=z.get("data",[]);adv=sum(1 for x in rows if (x.get("pChange") or 0)>0);dec=sum(1 for x in rows if (x.get("pChange") or 0)<0);unch=len(rows)-adv-dec
        return {"status":"READY","advances":adv,"declines":dec,"unchanged":unch,"total":len(rows),"advance_ratio":round(adv/max(1,adv+dec),3),"source":"NSE public index constituents"}
    except Exception as e:return {"status":"UNAVAILABLE","error":str(e)}

def fundamental_context():
    # NIFTY-wide intraday fundamentals are background regime inputs, never a trigger.
    out={"status":"PARTIAL","valuation":"NOT_INFERRED","earnings":"NOT_INFERRED","macro":"HEADLINE_LAYER"}
    try:
        s=requests.Session();s.headers.update(UA);s.get("https://www.nseindia.com/",timeout=8)
        r=s.get("https://www.nseindia.com/api/allIndices",timeout=10);r.raise_for_status()
        data=r.json().get("data",[])
        nifty=next((x for x in data if str(x.get("index","")).upper()=="NIFTY 50"),None)
        if nifty: out.update({"status":"READY_PUBLIC_INDEX","last":nifty.get("last"),"pChange":nifty.get("percentChange")})
    except Exception as e:out["error"]=str(e)
    return out

def sentiment(items):
    txt=" ".join((x.get("title") or "").lower() for x in items)
    positive=["beat","upgrade","growth","easing","rate cut","inflow","stimulus","strong","surge","bullish"]
    negative=["war","tariff","sanction","inflation","rate hike","downgrade","outflow","crisis","weak","bearish","recession"]
    p=sum(txt.count(x) for x in positive);n=sum(txt.count(x) for x in negative)
    risk_terms=[x for x in ["rbi","fed","fomc","inflation","cpi","tariff","war","sanction","election","geopolitical","rate hike","rate cut"] if x in txt]
    bias="BULLISH" if p>n else "BEARISH" if n>p else "MIXED"
    return {"bias":bias,"positive_terms":p,"negative_terms":n,"risk_terms":risk_terms,"risk_level":"ELEVATED" if risk_terms else "NORMAL"}

def option_intelligence(chain,spot):
    if not chain or not chain.get("calls"):return {"status":"UNAVAILABLE"}
    calls=chain["calls"];puts=chain["puts"]
    def agg(side):
        return {"oi":sum(x.get("openInterest") or 0 for x in side),"doi":sum(x.get("changeinOpenInterest") or 0 for x in side),"volume":sum(x.get("volume") or 0 for x in side)}
    ca=agg(calls);pa=agg(puts);pcr=pa["oi"]/ca["oi"] if ca["oi"] else None
    # Identify largest OI and largest fresh OI build around ATM.
    def top(side,key):
        return sorted(side,key=lambda x:x.get(key) or 0,reverse=True)[:5]
    atm=sorted([x for x in calls+puts if x.get("strike") is not None],key=lambda x:abs(x["strike"]-spot))[:10]
    return {"status":chain.get("status"),"expiry":chain.get("expiry"),"pcr":round(pcr,3) if pcr else None,
      "call":{"oi":ca["oi"],"doi":ca["doi"],"volume":ca["volume"]},"put":{"oi":pa["oi"],"doi":pa["doi"],"volume":pa["volume"]},
      "top_call_oi":[{"strike":x["strike"],"oi":x.get("openInterest"),"doi":x.get("changeinOpenInterest")} for x in top(calls,"openInterest")],
      "top_put_oi":[{"strike":x["strike"],"oi":x.get("openInterest"),"doi":x.get("changeinOpenInterest")} for x in top(puts,"openInterest")],
      "atm_contracts":atm}

def score_all(m,st,opts,breadth,sent):
    n=m.get("NIFTY",{});s=0;why=[]
    def add(v,t): 
        nonlocal s;s+=v;why.append(t)
    if n.get("price") and st.get("ema20") and st.get("ema50"):
        if n["price"]>st["ema20"]>st["ema50"]:add(2.5,"bullish EMA structure")
        elif n["price"]<st["ema20"]<st["ema50"]:add(-2.5,"bearish EMA structure")
        else:why.append("mixed EMA structure")
    r=st.get("rsi14")
    if r is not None:
        if 52<=r<=68:add(1.25,"RSI bullish regime")
        elif 32<=r<=48:add(-1.25,"RSI bearish regime")
        elif r>75:why.append("RSI overbought; continuation not assumed")
        elif r<25:why.append("RSI oversold; reversal not assumed")
    if st.get("macd") is not None:add(.75 if st["macd"]>0 else -.75,"MACD "+("positive" if st["macd"]>0 else "negative"))
    if st.get("adx14") is not None and st["adx14"]>=22:add(.5 if n.get("price",0)>st.get("ema20",0) else -.5,"ADX confirms directional strength")
    if st.get("patterns"):
        bull={"breakout","bullish_engulfing","hammer","double_bottom_candidate","morning_star_like"}
        bear={"breakdown","bearish_engulfing","shooting_star","double_top_candidate","evening_star_like"}
        add(.75*sum(1 for x in st["patterns"] if x in bull), "bullish chart-pattern evidence" if any(x in bull for x in st["patterns"]) else "")
        add(-.75*sum(1 for x in st["patterns"] if x in bear), "bearish chart-pattern evidence" if any(x in bear for x in st["patterns"]) else "")
    if breadth.get("status")=="READY":
        ratio=breadth["advance_ratio"]
        if ratio>=.65:add(.75,"NIFTY breadth supportive")
        elif ratio<=.35:add(-.75,"NIFTY breadth weak")
    if opts.get("pcr") is not None:
        if opts["pcr"]<.85:add(.5,"PCR supportive of risk-on")
        elif opts["pcr"]>1.15:add(-.5,"PCR supportive of risk-off")
    if sent["bias"]=="BULLISH":add(.4,"headline sentiment bullish")
    elif sent["bias"]=="BEARISH":add(-.4,"headline sentiment bearish")
    return round(s,2),why

def candidate(chain,spot,side):
    if not chain.get("calls"):return None
    rows=chain["calls"] if side=="CE" else chain["puts"];best=None
    for x in rows:
        strike=x.get("strike");bid=x.get("bid");ask=x.get("ask");last=x.get("lastPrice");oi=x.get("openInterest") or 0;vol=x.get("volume") or 0;iv=x.get("impliedVolatility") or 0
        if not strike or not last or bid is None or ask is None or ask<=bid or oi<500 or vol<100:continue
        mid=(bid+ask)/2;spread=(ask-bid)/mid if mid else 1
        if spread>.12 or abs(strike-spot)>spot*.04:continue
        score=100*(.35*max(0,1-spread/.12)+.25*min(1,math.log10(1+oi)/7)+.2*min(1,math.log10(1+vol)/6)+.2*max(0,1-abs(strike-spot)/(spot*.04)))
        z={k:x.get(k) for k in ["contractSymbol","strike","lastPrice","bid","ask","volume","openInterest","changeinOpenInterest","impliedVolatility","totalBuyQuantity","totalSellQuantity"]}
        z.update({"candidate_score":round(score,1),"side":side,"spread_pct":round(spread*100,2),"expiry":chain.get("expiry")})
        if best is None or score>best["candidate_score"]:best=z
    return best

def main():
    ist=v3.now_ist();ts=datetime.now(timezone.utc).isoformat()
    j=v3.load(JOURNAL,{"open":None,"closed":[],"stats":{},"lessons":{}})
    if not v3.market_open(ist):
        save(OUT,{"owner":"Rupendra","engine_version":"6.0","timestamp":ts,"ist_time":ist.isoformat(),"market_open":False,"market_status":"MARKET CLOSED","decision":"MARKET CLOSED","decision_type":"SESSION_STATE","signal_strength":0,"model_score":None,"confidence":None,"reason":"Research continues outside session; final trade decision disabled.","previous_decision":j.get("closed",[])[-1] if j.get("closed") else None,"journal_stats":j.get("stats",{}),"learning":j.get("learning_summary",{}),"research_state":{"evidence_engine":"ACTIVE","pattern_engine":"ACTIVE","sentiment_engine":"ACTIVE","fundamental_engine":"ACTIVE_PUBLIC_BACKGROUND","learning_engine":"ACTIVE","decision_engine":"OFF_OUTSIDE_SESSION"},"data_quality":{"status":"SESSION_CLOSED"}});return
    symbols={"NIFTY":"^NSEI","VIX":"^INDIAVIX","SPX":"^GSPC","NASDAQ":"^IXIC","USDINR":"INR=X","CRUDE":"CL=F","GOLD":"GC=F"}
    m={}
    for k,sym in symbols.items():
        try:m[k]=v3.market_series(sym)
        except Exception as e:m[k]={"fresh":False,"error":str(e)}
    n=m.get("NIFTY",{});spot=n.get("price")
    o,h,l,c,v=[],[],[],[],[]
    try:
        d=v3.chart("^NSEI",interval="5m",range_="5d");q=d["indicators"]["quote"][0];o=clean(q.get("open"));h=clean(q.get("high"));l=clean(q.get("low"));c=clean(q.get("close"));v=clean(q.get("volume"))
    except Exception:pass
    st=structure(o,h,l,c) if c else {}
    # Public NSE chain is preferred by v3; Yahoo remains fallback.
    chain=v3.try_option_chain(spot) if spot else {"status":"NO_SPOT","fresh":False}
    opts=option_intelligence(chain,spot) if spot else {"status":"NO_SPOT"}
    breadth=nse_index_breadth(); items=v3.news(); sent=sentiment(items); fund=fundamental_context()
    score,why=score_all(m,st,opts,breadth,sent)
    validation=v3.validation()
    validation_ok=validation.get("samples",0)>=30 and (validation.get("hit_rate") or 0)>=55
    freshness=sum(1 for k in symbols if m.get(k,{}).get("fresh"))
    chain_ok=chain.get("fresh") and chain.get("count",0)>50
    side="CE" if score>0 else "PE"
    cand=candidate(chain,spot,side) if chain_ok else None
    option_ok=bool(cand and cand.get("candidate_score",0)>=65)
    # Stronger confluence gate: direction + validation + breadth/options/news/data.
    action="BUY CALL" if score>=6.5 and validation_ok and option_ok and freshness>=5 and sent["risk_level"]=="NORMAL" else "BUY PUT" if score<=-6.5 and validation_ok and option_ok and freshness>=5 and sent["risk_level"]=="NORMAL" else "NO TRADE"
    blockers=[]
    if freshness<5:blockers.append("insufficient synchronized public market inputs")
    if not chain_ok:blockers.append("options chain unavailable/not fresh")
    if not option_ok:blockers.append("no liquid option candidate")
    if not validation_ok:blockers.append("historical validation gate not met")
    if sent["risk_level"]!="NORMAL":blockers.append("elevated event risk")
    if abs(score)<6.5:blockers.append("evidence confluence below trade threshold")
    confidence=max(0,min(99,50+score*4+(8 if validation_ok else -12)+(8 if option_ok else -15)+(4 if breadth.get("status")=="READY" else -4)))
    plan={}
    if action!="NO TRADE" and cand:
        e=float(cand["ask"] or cand["lastPrice"]); a=n.get("atr14") or 20
        if action=="BUY CALL":stop=max(.05,e-a*.8);t1=e+a*1.2;t2=e+a*2
        else:stop=e+a*.8;t1=max(.05,e-a*1.2);t2=max(.05,e-a*2)
        plan={"entry":round(e,2),"stop":round(stop,2),"target1":round(t1,2),"target2":round(t2,2),"risk_reward":round(abs(t2-e)/max(abs(e-stop),.01),2),"exit":"Exit on stop, target2, thesis invalidation, or loss of required data freshness."}
    ev=[
      "Structure: "+str(st),
      "Options: "+str(opts),
      "Breadth: "+str(breadth),
      "Sentiment: "+str(sent),
      "Fundamental/background: "+str(fund),
      "Validation: "+str(validation),
      "Global: "+str({k:m.get(k,{}).get("change_pct") for k in ["SPX","NASDAQ","USDINR","CRUDE","GOLD"]})
    ]
    result={"owner":"Rupendra","engine_version":"6.0","timestamp":ts,"ist_time":ist.isoformat(),"market_open":True,"market_status":"MARKET OPEN","decision":action,"decision_type":"TRADE_SIGNAL" if action!="NO TRADE" else "ABSTAIN","signal_strength":round(confidence,1),"model_score":score,"confidence":round(confidence/100,3),"reason":("Trade gate passed: "+", ".join(why) if action!="NO TRADE" else "NO TRADE — "+"; ".join(blockers)),"nifty":spot,"vix":m.get("VIX",{}).get("price"),"regime":"BULLISH" if score>2 else "BEARISH" if score<-2 else "MIXED","market":m,"structure":st,"patterns":st.get("patterns",[]),"option_data":chain,"option_intelligence":opts,"candidate":cand,"breadth":breadth,"sentiment":sent,"fundamental":fund,"news":items,"validation":validation,"plan":plan,"evidence":ev,"previous_decision":j.get("closed",[])[-1] if j.get("closed") else None,"journal_stats":j.get("stats",{}),"learning":j.get("learning_summary",{}),"data_quality":{"fresh_sources":freshness,"public_data_only":True,"tick_live":False,"options_verified":chain_ok,"trade_gate":action!="NO TRADE"},"research_state":{"evidence_engine":"ACTIVE","technical_engine":"ACTIVE","chart_pattern_engine":"ACTIVE","options_engine":"ACTIVE" if chain_ok else "WAITING","sentiment_engine":"ACTIVE","fundamental_engine":"ACTIVE_PUBLIC_BACKGROUND","breadth_engine":"ACTIVE" if breadth.get("status")=="READY" else "WAITING","validation_engine":"ACTIVE","learning_engine":"ACTIVE","decision_engine":"ACTIVE"}}
    hist=v3.load(HISTORY,[]);hist.append({"timestamp":ts,"ist_time":ist.isoformat(),"nifty":spot,"decision":action,"contract":cand.get("contractSymbol") if cand else None,"score":score,"confidence":round(confidence,1),"option_status":chain.get("status")});v3.save(HISTORY,hist[-500:])
    v3.update_learning(j,result);save(OUT,result)

if __name__=="__main__":main()
