# NIFTY Intelligence Terminal

Human-controlled NIFTY 50 research and decision-support terminal.

## Intelligence stack

The cloud engine runs a conservative multi-evidence pipeline covering:
- multi-timeframe price structure, EMA/SMA, RSI, MACD, ADX, ATR, Bollinger Bands, VWAP and momentum
- candlestick and classical chart-pattern detection
- support/resistance, breakout/breakdown, compression and trend structure
- NIFTY breadth
- NIFTY option-chain intelligence: OI, change in OI, volume, IV, bid/ask, PCR, max pain and liquidity filters when the public chain is accessible
- news/event sentiment
- global context: S&P 500, NASDAQ, USD/INR, crude and gold
- public fundamental/background context
- rolling historical validation
- decision history, P/L diagnostics and learning state
- strict data-quality and abstention gates

## Runtime

The hosted research site is updated by GitHub Actions. Research/learning remains available outside market hours; the final trading decision is disabled outside NSE regular derivatives hours.

The current free deployment uses public web data. It does not claim exchange tick-by-tick/1-second data. NSE distinguishes public/snapshot access from its authorized real-time Level 1/2/3 and tick-by-tick feeds. A genuine tick-live adapter must be connected before the tick-live gate can become true.

## Safety

- Signal-only; no order execution.
- No broker credentials, OTPs, PINs or order endpoints.
- No guarantee of profit or correctness.
- If required evidence is stale, missing, contradictory or insufficient, the engine returns NO TRADE rather than inventing a signal.
