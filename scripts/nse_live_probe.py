#!/usr/bin/env python3
"""Public NSE live-data probe. Uses NSE's no-auth CM Market MCP HTTP endpoint.
This is intentionally informational: NSE says CM Market Live is typically 1-3 minutes behind exchange trading.
"""
import json, os, time, urllib.request

URL = "https://mcp.nseindia.in/cmmkt/mcp"
OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "nse_live.json")

# Streamable HTTP MCP initialize + tools/list. We discover the tool instead of hard-coding a private API.
def post(payload, session=None):
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json, text/event-stream")
    if session: req.add_header("Mcp-Session-Id", session)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.headers.get("Mcp-Session-Id"), r.read().decode(errors="replace")

def parse_sse(txt):
    for line in txt.splitlines():
        if line.startswith("data:"):
            try: return json.loads(line[5:].strip())
            except Exception: pass
    try: return json.loads(txt)
    except Exception: return None

try:
    sid, raw = post({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"rupendra-terminal","version":"1.0"}}})
    if sid:
        post({"jsonrpc":"2.0","method":"notifications/initialized","params":{}}, sid)
    sid, raw2 = post({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}, sid)
    obj = parse_sse(raw2) or {}
    tools = obj.get("result",{}).get("tools",[])
    names = [t.get("name","") for t in tools]
    # Find the NSE live-index tool by description/name.
    target = next((t for t in tools if "index" in (t.get("name","")+t.get("description","")).lower() and "live" in (t.get("name","")+t.get("description","")).lower()), None)
    result = {"source":"NSE CM Market MCP","retrieved_at":time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),"tool_count":len(tools),"tools":names[:50]}
    if target:
        schema = target.get("inputSchema",{}); props=schema.get("properties",{})
        args={}
        # Prefer NIFTY 50 if a symbol/index parameter exists.
        for k in props:
            if k.lower() in ("index","index_name","symbol","name"): args[k]="NIFTY 50"
        sid, raw3 = post({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":target["name"],"arguments":args}}, sid)
        result["tool"]=target["name"]; result["arguments"]=args; result["response"]=parse_sse(raw3)
    else:
        result["status"]="tool_not_found"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT,"w",encoding="utf-8") as f: json.dump(result,f,ensure_ascii=False,indent=2)
except Exception as e:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT,"w",encoding="utf-8") as f: json.dump({"source":"NSE CM Market MCP","status":"error","error":str(e),"retrieved_at":time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},f,indent=2)
