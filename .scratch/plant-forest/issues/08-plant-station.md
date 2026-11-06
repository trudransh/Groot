# 08: Plant station on the Raspberry Pi

**What to build:** a real plant reports its moisture and a camera frame to the agent service, its pump runs for exactly the ordered millilitres after a confirmed `WaterOrdered`, and the station shows SAFE_STOP within 10 seconds of losing contact.

**Blocked by:** 01 for sensors and pumps; 04 for orders.

**Status:** ready-for-human

**Owner:**

- [ ] Sensors calibrated to 0 to 1; `ml_per_second` measured per pump
- [ ] `POST /readings/:plantName` every 10 seconds with a frame of at most 300 KB
- [ ] Order watcher fires each order once; pump capped at `max_pump_seconds`; no pumping into wet soil
- [ ] SAFE_STOP on network loss within 10 seconds, shown on the station
- [ ] Starts on boot
- [ ] 50 ml test order measured in a cup for each pump
