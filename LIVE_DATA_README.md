# Live data architecture

The terminal now uses the public NSE CM Market MCP (`https://mcp.nseindia.in/cmmkt/mcp`) with no broker credentials. NSE states that CM Market Live is current market pricing typically 1–3 minutes behind real-time. The cloud workflow polls every 5 minutes and stores the response in `data/nse_live.json` and `data/market_snapshot.json`.

This is **not** exchange tick-by-tick data. The UI must show the data-age/source and must not label it as tick-live. Exact trading decisions remain subject to data-quality gates.
