# NIFTY Intelligence Terminal

Human-controlled NIFTY 50 research and decision-support terminal.

## Intelligence stack

The cloud engine uses a conservative multi-evidence pipeline covering:
- multi-timeframe 1m/5m/15m/30m price structure and confluence
- EMA 9/20/50/200, RSI, MACD, ADX, ATR, Bollinger Bands, VWAP and momentum
- candlestick patterns plus conservative classical-pattern candidates: breakouts/breakdowns, double/triple tops/bottoms, triangles, flags/pennants and compression
- support/resistance and market structure
- NIFTY breadth
- NIFTY option-chain intelligence when legitimately accessible: LTP, bid/ask, volume, OI, change in OI, IV, PCR, max pain, liquidity and estimated Greeks
- news/event sentiment and global context: S&P 500, NASDAQ, USD/INR, crude and gold
- public fundamental/macro background context; it is explicitly not presented as company-by-company earnings/valuation research
- 5m/15m walk-forward validation
- decision history, P/L diagnostics and learning state
- strict freshness, confluence, liquidity and abstention gates

## Runtime

The hosted research site is updated by GitHub Actions. Research/learning remains available outside market hours; the final trading decision is disabled outside NSE regular derivatives hours.

The free deployment uses public web data and is **not** an exchange tick-by-tick or guaranteed 1-second feed. NSE's current documentation says genuine Level 1/2/3 and tick-by-tick feeds are provided through NSE Data & Analytics / authorized vendors, while snapshot products are separate. A verified realtime provider adapter must be connected before the terminal can truthfully claim tick-live monitoring.

## Safety

- Signal-only; no order execution.
- No broker credentials, OTPs, PINs or order endpoints.
- No guarantee of profit or correctness.
- If required evidence is stale, missing, contradictory or insufficient, the engine returns NO TRADE rather than inventing a signal.
