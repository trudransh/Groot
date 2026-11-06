# 04: Water path: a plant buys water and drinks

**What to build:** when a plant decides `water`, its wallet pays the supplier, `WaterOrdered` confirms, the plant is watered (pump for a real plant, moisture raised for a simulated one), delivery is reported, and forest talk says so.

**Blocked by:** 03

**Status:** ready-for-agent

**Owner:**

- [ ] `orderWater` called with request ID and root; caps respected
- [ ] Shared order-watcher logic: each order handled exactly once, after one confirmation
- [ ] Simulated plant's moisture rises by `ml / 1000`
- [ ] `POST /delivered/:plantName` recorded; talk line `water` emitted
- [ ] `soil_wet`, `min_water_gap` and `cannot_afford_water` rules shown working on a run
