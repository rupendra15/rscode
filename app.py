from flask import Flask, jsonify, render_template_string
from datetime import datetime, timezone

app = Flask(__name__)

HTML = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIFTY Intelligence Terminal</title><style>body{font-family:Inter,Arial,sans-serif;background:#0b1020;color:#eef2ff;margin:0}main{max-width:900px;margin:auto;padding:24px}.card{background:#121a2e;border:1px solid #263252;border-radius:16px;padding:20px;margin:14px 0}.action{font-size:42px;font-weight:800}.muted{color:#9aa8c7}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#1c2742}.btn{background:#eef2ff;color:#0b1020;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style></head><body><main><h1>NIFTY Intelligence Terminal</h1><div class="muted">Human-controlled • Signal only • Paper/research mode</div><div class="card"><div class="muted">CURRENT DECISION</div><div id="action" class="action">NO TRADE</div><div id="reason">Waiting for a verified market-data snapshot.</div></div><div class="grid"><div class="card"><b>Market regime</b><p id="regime">DATA WAIT</p></div><div class="card"><b>Data status</b><p><span class="pill">Awaiting authorized live feed</span></p></div></div><div class="card"><b>System rule</b><p>The terminal will not invent a BUY/SELL signal from stale, incomplete or simulated data. A real signal requires timestamped market, derivatives, volatility, breadth and event inputs.</p><button class="btn" onclick="load()">Refresh analysis</button></div></main><script>async function load(){const r=await fetch('/api/signal');const x=await r.json();document.getElementById('action').textContent=x.action;document.getElementById('reason').textContent=x.reason;document.getElementById('regime').textContent=x.regime}load()</script></body></html>'''

@app.get('/')
def home():
    return render_template_string(HTML)

@app.get('/health')
def health():
    return jsonify(status='ok',service='nifty-intelligence-terminal',mode='paper/research')

@app.get('/api/signal')
def signal():
    return jsonify({
        'action':'NO_TRADE',
        'regime':'DATA WAIT',
        'confidence':0,
        'reason':'No authorized live market-data snapshot is connected yet. The safety gate prevents fabricated trading signals.',
        'timestamp':datetime.now(timezone.utc).isoformat(),
        'execution':'DISABLED'
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0',port=10000)
