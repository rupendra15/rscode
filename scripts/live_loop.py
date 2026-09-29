#!/usr/bin/env python3
"""Cloud live-data loop: poll the public NSE CM Market MCP and persist fresh state.
The source is no-auth and NSE describes it as approximately 1-3 minutes behind real-time.
"""
import json, subprocess, time
subprocess.run(["python3","scripts/nse_live_probe.py"], check=False)
try:
    with open("data/nse_live.json", encoding="utf-8") as f: live=json.load(f)
except Exception as e: live={"status":"error","error":str(e)}
try:
    with open("data/market_snapshot.json", encoding="utf-8") as f: snap=json.load(f)
except Exception: snap={}
snap["nse_live"] = live
snap["live_data_source"] = "NSE CM Market MCP"
snap["live_data_note"] = "NSE states CM Market Live is typically 1-3 minutes behind real-time."
with open("data/market_snapshot.json","w",encoding="utf-8") as f: json.dump(snap,f,ensure_ascii=False,indent=2)
print(json.dumps({"status":live.get("status","ok"),"source":"NSE CM Market MCP","updated":live.get("retrieved_at")},ensure_ascii=False))
