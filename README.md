# NIFTY Intelligence Terminal

Human-controlled NIFTY 50 decision-support dashboard. It produces BUY, SELL or NO TRADE and never places orders.

## Current mode

This first hosted build is **research/paper mode**. It does not pretend to have a live exchange feed until an authorized data source is connected. The app includes a conservative signal engine, risk gates, audit-friendly evidence and a manual market-input API.

## Deploy

- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app`
- Health: `/health`
- Dashboard: `/`
- Signal API: `/api/signal`

## Safety

No broker credentials, OTPs, PINs or order-execution endpoints are used. A production live-data adapter must be connected separately and must preserve source timestamps and point-in-time data.
