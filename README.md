# gta6-twitch-ccu-forecast-01

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/junod1908/gta6-twitch-ccu-forecast-01/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/junod1908/gta6-twitch-ccu-forecast-01/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

**Comparable-Curve Forecaster** — predicts Grand Theft Auto VI's launch-day Twitch viewers, hour by hour (hours 2–24 UTC), as five quantiles per hour, from the first hour's print and the release-day curves of past game launches.

The case file carries 38 past launches (42 in the final) with their full release-day hourly curves. For each past launch the forecaster extracts the log ratio r_h = ln(viewers_h / viewers_1) of every release-day hour against its own first hour. A launch only enters the pool if its curve is usable: hour 1 present and at least 20 of the 24 release-day hours recorded (this drops the pre-release GTA VI category entry, whose day_start is not a launch). Each comparable is then weighted by how close its first-hour audience is to the target's, with a Gaussian kernel on log scale, w = exp(−(ln v1_comp − ln p1)² / 2) — launches of a similar size shape the forecast, and the small-hour-1 launches whose ratios explode after a late global unlock fade out on their own. The forecast for hour h is the weighted empirical quantile of the pool's r_h values (midpoint-CDF interpolation) at the five scored levels, with the median log ratio scaled by 1.05 and no spread adjustment: q_τ = p1 · exp(1.05 · med + (q_τ − med)). If an hour's pool is empty the program falls back to the house persistence formula.

The parameters were chosen by leave-one-out backtest over the 37 valid comparables in the practice cases (each launch forecast from the other 36, scored with the contest's log-scale pinball loss): this model scores **0.397** overall against the house persistence baseline's **0.930**; on the launches most like GTA VI it scores **0.207** on big launches (first hour ≥ 50k viewers, baseline 0.251) and **0.270** on big rolling-midnight console launches (baseline 0.357). The program is a pure function of the case file — no network, no clock, no randomness — so two runs write byte-identical forecasts, each case in a fraction of the 8-second cap.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=pex4n748&utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
