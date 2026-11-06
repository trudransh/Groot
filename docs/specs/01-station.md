# 01. WS-STATION: the plant station (Raspberry Pi)

## Problem Statement

A plant on a table cannot tell anyone it is thirsty, and cannot water itself. For the forest to be physical, a real plant needs eyes and a sensor that report its state, and a pump that waters it only when the plant has paid for the water. If the network drops or 0G stops answering, the pump has to stay off rather than flood the pot.

## Solution

A Raspberry Pi next to the pots, with a camera, one soil-moisture sensor per plant and one pump per plant. Every few seconds it sends each plant's reading and a camera frame to the agent service. It watches the 0G chain for `WaterOrdered` events from its plants' wallets, and runs a plant's pump for exactly the ordered millilitres once the event is confirmed. Its own firmware limits make it safe on its own: a maximum pump time, no pumping into wet soil, and a visible `SAFE_STOP` when it loses contact.

## User Stories

1. As a plant, I want my soil moisture reported every few seconds, so that my agent decides from my real state.
2. As a plant, I want a camera frame sent with my reading, so that 0G can see me as well as read the number.
3. As a plant, I want my pump to run only after my water order is confirmed onchain, so that water is something I paid for.
4. As a plant, I want my pump to run for exactly the ordered millilitres, so that the order and the water match.
5. As a plant, I want the pump to refuse to run into already-wet soil, so that a bad decision cannot drown me.
6. As a plant, I want the pump never to run past a fixed maximum time, so that a stuck relay or a wrong flow rate cannot flood the table.
7. As the team on stage, I want the station to show `SAFE_STOP` within 10 seconds of losing the network, so that judges see the safe-stop fallback live.
8. As the team on stage, I want each pump to fire once per order even if the event is seen twice, so that a reconnect does not double-water.
9. As the team, I want delivered water reported back to the agent service, so that the forest talk feed can say "banyan-01 drank 120 ml".
10. As the team, I want the station configured with plant names only, so that wallet addresses come from ENS through the service and nothing is hard-coded.
11. As the team, I want a manual test mode that runs one pump for a few seconds, so that we can calibrate millilitres per second with a measuring cup.
12. As the team, I want the station to start on boot and recover after a power cut, so that a demo-table restart does not need a keyboard.
13. As a judge, I want to see a light or a screen state per plant (ok, watering, safe stop), so that I can tell what the device is doing without reading logs.
14. As the team, I want the station to keep working with only one real plant connected, so that a broken sensor on one pot does not stop the demo.

## Implementation Decisions

- **Language:** Python 3.11 on Raspberry Pi OS. This was the team's call: "Python on the Pi".
- **Hardware (to confirm in the morning):**
  - Capacitive soil-moisture sensors through an ADC (for example an ADS1115), because the Pi has no analog input.
  - Pumps switched by a relay or MOSFET board on GPIO.
  - A Pi camera or a phone running an IP-camera app.
- **Calibration:**
  - Moisture is reported as 0 to 1, from a dry reading and a wet reading taken per sensor at setup.
  - `ml_per_second` is measured per pump.
- **Sending readings:** `POST /readings/:plantName` every `reading_interval_s` with the `PlantReading` shape from `00-interfaces.md`. Frames are JPEG, at most 300 KB.
- **Watching orders:**
  - Poll the 0G RPC for `WaterOrdered` logs from the plants' wallet addresses (fetched from `GET /forest`), from the last seen block.
  - Act on a log once it has 1 confirmation.
  - Keep a persisted set of handled `orderId`s per wallet, so every order fires at most once.
- **Firmware safety, independent of the service:**
  - Pump time = `min(ml / ml_per_second, max_pump_seconds)`.
  - Skip if moisture is at or above `wet_threshold`.
  - `SAFE_STOP` when neither the service nor the RPC has answered for `offline_safe_stop_s`.
- **Delivery:** after pumping, `POST /delivered/:plantName` with `{ orderId, ml, pumpMs }`.
- **Prior code:** if the earlier prototype code was written before 5 Nov, it is rewritten during the event (From Scratch rule). The hardware is reused as is.

## Testing Decisions

- A good test drives the station through its outside edges (readings in, events in, pump on or off out) with the GPIO, ADC and RPC faked. It never asserts on internal variables.
- What gets tested:
  - The order watcher, with fake logs: duplicate orders, out-of-order logs, a reconnect.
  - The pump controller, with fake GPIO: time cap, wet-soil skip.
  - The safe-stop timer, with a fake clock.
- One real-hardware check per pump before the demo: order 50 ml and measure the cup.

## Out of Scope

- Water routing between pots. Only money moves between plants.
- Signing transactions on the Pi. The plant agents in the agent service hold the keys.
- Nutrients and any sensor other than moisture and the camera.

## Further Notes

- If the hardware is not ready in the morning, WS-SIM carries the demo and the station joins when it works. Nothing else depends on the station being present.
- Water on the venue table needs a tray and a small reservoir. Bring towels.
