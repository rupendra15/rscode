from flask import Flask, jsonify, render_template_string
from datetime import datetime, timezone
import math

app = Flask(__name__)

try:
    import yfinance as yf
    LIVE_LIB = True
except Exception:
    LIVE_LIB = False

HTML = r'''<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NIFTY Intelligence Terminal</title>
<style>
:root{--bg:#07101f;--card:#0d1a2f;--line:#203452;--text:#edf4ff;--muted:#8ea3c2;--good:#42d392;--bad:#ff6b7a;--warn:#f4c95d}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#07101f,#0a1426 55%,#091b2d);color:var(--text);font-family:Inter,system-ui,Arial,sans-serif}main{max-width:1180px;margin:auto;padding:22px}.top{display:flex;justify-content:space-between;gap:15px;align-items:center}.brand{font-size:24px;font-weight:850}.sub{color:var(--muted);font-size:13px;margin-top:4px}.status{border:1px solid var(--line);padding:8px 12px;border-radius:999px;font-size:12px}.hero{margin-top:18px;background:linear-gradient(145deg,#10233e,#0b172a);border:1px solid #284361;border-radius:22px;padding:25px}.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1.5px}.decision{font-size:52px;font-weight:900;margin:8px 0}.buy{color:var(--good)}.sell{color:var(--bad)}.wait{color:var(--warn)}.reason{color:#c5d3e8;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}.card{background:rgba(13,26,47,.9);border:1px solid var(--line);border-radius:16px;padding:17px}.value{font-size:23px;font-weight:800;margin-top:6px}.muted{color:var(--muted);font-size:12px}.wide{grid-column:span 2}.evidence{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.ev{padding:11px;border:1px solid var(--line);border-radius:12px;background:#0a1527}.ok{color:var(--good)}.no{color:var(--muted)}button{border:0;border-radius:12px;padding:12px 17px;background:#eaf2ff;color:#07101f;font-weight:800;cursor:pointer}button:disabled{opacity:.6}.footer{color:var(--muted);font-size:11px;margin:18px 2px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}.wide{grid-column:span 2}}@media(max-width:500px){.grid,.evidence{grid-template-columns:1fr}.wide{grid-column:span 1}.decision{font-size:42px}}
</style></head><body><main>
<div class="top"><div><div class="brand">NIFTY Intelligence Terminal</div><div class="sub">Human-controlled • signal-only • no order execution</div></div><div id="status" class="status">INITIALISING</div></div>
<section class="hero"><div class="label">System decision</div><div id="decision" class="decision wait">NO TRADE</div><div id="reason" class="reason">Loading the latest available market snapshot…</div><div style="margin-top:16px"><button id="refresh" onclick="load()">Analyze NIFTY</button></div></section>
<div class="grid">
<div class="card"><div class="muted">NIFTY</div><div id="spot" class="value">—</div></div>
<div class="card"><div class="muted">REGIME</div><div id="regime" class="value">—</div></div>
<div class="card"><div class="muted">CONFIDENCE</div><div id="confidence" class="value">—</div></div>
<div class="card"><div class="muted">DATA STATUS</div><div id="data" class="value">—</div></div>
<div class="card wide"><div class="muted">TRADE PLAN</div><div id="plan" class="reason" style="margin-top:8px">—</div></div>
<div class="card wide"><div class="muted">EVIDENCE</div><div id="evidence" class="evidence"></div></div>
</div><div class="footer">Safety gate: the terminal refuses to invent BUY/SELL decisions when data is stale, incomplete, unavailable or insufficiently confirmed. This application does not place orders.</div>
</main><script>
async function load(){const b=document.getElementById('refresh');b.disabled=true;b.textContent='Analyzing…';try{const r=await fetch('/api/signal?ts='+Date.now());const x=await r.json();
const d=document.getElementById('decision');d.textContent=x.action;d.className='decision '+(x.action==='BUY'?'buy':x.action==='SELL'?'sell':'wait');
document.getElementById('reason').textContent=x.reason;document.getElementById('spot').textContent=x.spot?x.spot.toLocaleString('en-IN'): '—';document.getElementById('regime').textContent=x.regime||'—';document.getElementById('confidence').textContent=x.confidence?Math.round(x.confidence*100)+'%':'—';document.getElementById('data').textContent=x.data_status||'—';
document.getElementById('plan').innerHTML=x.plan||'No validated trade plan.';document.getElementById('evidence').innerHTML=(x.evidence||[]).map(e=>'<div class="ev"><b>'+e.name+'</b><div class="'+(e.ok?'ok':'no')+'">'+e.value+'</div></div>').join('');document.getElementById('status').textContent=x.timestamp||'READY';
}catch(e){document.getElementById('reason').textContent='Analysis unavailable. Safety gate remains NO TRADE.'}finally{b.disabled=false;b.textContent='Analyze NIFTY'}}load();setInterval(load,300000);
</script></body></html>'''

def safe_float(x):
    try:
        x=float(x)
        return x if math.isfinite(x) else None
    except Exception:return None

def live_snapshot():
    if not LIVE_LIB:
        return None
    try:
        t=yf.Ticker('^NSEI')
        h=t.history(period='5d',interval='5m',auto_adjust=False)
        if h is None or h.empty:return None
        close=h['Close'].dropna(); last=safe_float(close.iloc[-1]);
        if last is None:return None
        vix=None
        try:
            vh=yf.Ticker('^INDIAVIX').history(period='2d',interval='1d',auto_adjust=False)
            if vh is not None and not vh.empty:vix=safe_float(vh['Close'].dropna().iloc[-1])
        except Exception:pass
        ema20=safe_float(close.ewm(span=20).mean().iloc[-1]); ema50=safe_float(close.ewm(span=50).mean().iloc[-1]);
        delta=close.diff(); gain=delta.clip(lower=0).rolling(14).mean(); loss=(-delta.clip(upper=0)).rolling(14).mean(); rs=gain/loss
        rsi=safe_float((100-(100/(1+rs))).iloc[-1])
        atr=safe_float((h['High']-h['Low']).rolling(14).mean().iloc[-1])
        return {'spot':last,'ema20':ema20,'ema50':ema50,'rsi':rsi,'atr':atr,'vix':vix,'bars':len(h),'timestamp':datetime.now(timezone.utc).isoformat()}
    except Exception:return None

def make_signal(s):
    # Conservative baseline: public-data snapshot only. Derivatives/news/breadth are not inferred when unavailable.
    if not s:return {'action':'NO TRADE','regime':'DATA WAIT','confidence':0,'reason':'No verified market snapshot is available. The safety gate prevents fabricated signals.','data_status':'UNAVAILABLE','plan':'Connect an authorized live multi-source market feed before using BUY/SELL signals.','evidence':[],'timestamp':'DATA WAIT'}
    score=0; ev=[]
    if s['ema20'] and s['ema50']:
        up=s['ema20']>s['ema50']; score += 1.5 if up else -1.5; ev.append({'name':'Trend','value':'EMA20 above EMA50' if up else 'EMA20 below EMA50','ok':True})
    if s['rsi'] is not None:
        ok=45<=s['rsi']<=70; ev.append({'name':'Momentum','value':f"RSI {s['rsi']:.1f}" + (' • usable' if ok else ' • caution'),'ok':ok})
    ev.append({'name':'Derivatives','value':'Not connected • not inferred','ok':False})
    ev.append({'name':'Breadth / FII-DII','value':'Not connected • not inferred','ok':False})
    ev.append({'name':'News / Macro','value':'Not connected • not inferred','ok':False})
    return {'action':'NO TRADE','regime':'RESEARCH ONLY','confidence':0,'reason':'Some public price data is available, but independent derivatives, breadth, institutional, macro and news confirmation is not yet verified. No BUY/SELL signal is issued.','data_status':'PARTIAL','plan':'No trade. Wait for the full multi-source intelligence layer.','evidence':ev,'spot':s['spot'],'timestamp':s['timestamp']}

@app.get('/')
def home():return render_template_string(HTML)
@app.get('/health')
def health():return jsonify(status='ok',service='nifty-intelligence-terminal',execution='disabled')
@app.get('/api/signal')
def signal():return jsonify(make_signal(live_snapshot()))
if __name__=='__main__':app.run(host='0.0.0.0',port=10000)
