# pump_wifi

ESP32 sketch that switches a water pump through an active-LOW relay on GPIO 18, controlled over HTTP.

## Setup

1. Copy `secrets.example.h` to `secrets.h` (gitignored) and set `WIFI_SSID`, `WIFI_PASSWORD`, `API_TOKEN`.
   The network must be 2.4 GHz. Use a long random token, e.g. `openssl rand -hex 24`.
2. Flash, open Serial Monitor at 115200, note the printed IP.

### Arduino IDE settings

| Setting | Value |
|---|---|
| Board package | esp32 by Espressif Systems (Boards Manager) |
| Board | ESP32 Dev Module |
| Upload Speed | 921600 (drop to 115200 if uploads fail) |
| CPU Frequency | 240 MHz |
| Flash Frequency / Mode | 80 MHz / QIO |
| Partition Scheme | Default 4MB with spiffs |
| Port | macOS: `/dev/cu.usbserial-*` or `/dev/cu.SLAB_USBtoUART` / `/dev/cu.wchusbserial*`; Linux: `/dev/ttyUSB0`; Windows: `COMx` |
| Serial Monitor | 115200 baud |

If upload hangs at `Connecting...`, hold BOOT until it starts writing.

## Behavior

- Pump forced OFF (GPIO 18 HIGH) at boot.
- Timer is non-blocking (`millis()` in `loop()`, rollover-safe subtraction).
- A new `/pump` request while running resets the timer.
- Hard cap: one continuous run never exceeds 60 s, even if requests keep resetting the timer. Send `/kill` (or let it stop) to start a fresh run.
- WiFi reconnects automatically (auto-reconnect plus a manual retry every 10 s).
- Every command and every ON/OFF change is logged to Serial.

## API

Auth: every route except `/status` requires the token, as header `X-Token: <token>` or query `?token=<token>`. Missing/wrong token returns 401.

| Route | Methods | Success | Errors |
|---|---|---|---|
| `/pump?seconds=N` | GET, POST | 200 `{"pump":"on","requested_ms":..,"remaining_ms":..,"capped":bool}` | 400 (N missing, not an integer, <=0 or >60), 401, 405 |
| `/kill` | GET, POST | 200 `{"pump":"off","remaining_ms":0}` | 401, 405 |
| `/status` | GET | 200 `{"pump":"on"\|"off","remaining_ms":..,"ip":"..","uptime_ms":..}` | 405 |
| other | any | | 404 |

`capped: true` means the 60 s hard cap ends the run before the requested time.

### curl examples

```sh
TOKEN=your-token
HOST=plantpump.local        # or the IP, e.g. 192.168.1.50

# run 5 s (header auth)
curl -X POST "http://$HOST/pump?seconds=5" -H "X-Token: $TOKEN"

# run 10 s (query auth, GET)
curl "http://$HOST/pump?seconds=10&token=$TOKEN"

# stop now
curl -X POST "http://$HOST/kill" -H "X-Token: $TOKEN"

# status (no token)
curl "http://$HOST/status"

# expected errors
curl -i "http://$HOST/pump?seconds=0"  -H "X-Token: $TOKEN"   # 400
curl -i "http://$HOST/pump?seconds=61" -H "X-Token: $TOKEN"   # 400
curl -i "http://$HOST/pump?seconds=5"                          # 401
```

## Local access

```sh
curl "http://plantpump.local/pump?seconds=5" -H "X-Token: ..."
curl "http://192.168.1.50/pump?seconds=5"    -H "X-Token: ..."
```

mDNS (`.local`) is unreliable on Android hotspots and some Windows setups. Use the IP from the Serial Monitor (also returned by `/status`) as a fallback.

Without a tunnel, the device is reachable only from the local network.

## Remote access via Cloudflare Tunnel

`cloudflared` cannot run on the ESP32. Run it on another always-on device on the same network (laptop, Raspberry Pi, or an Android phone with Termux) and point it at `http://<esp-ip>:80`.

Give the ESP32 a fixed address first: add a DHCP reservation for its MAC in the router, or set a static IP. Otherwise the tunnel target breaks when the lease changes. Use the IP rather than `plantpump.local` as the target, because mDNS resolution from the tunnel host may fail.

### Install cloudflared

- macOS: `brew install cloudflared`
- Raspberry Pi / Debian: install the `.deb` from Cloudflare's releases or their apt repo
- Termux: `pkg install cloudflared`

### Quick tunnel (no account, random URL)

```sh
cloudflared tunnel --url http://192.168.1.50:80
```

Prints a `https://<random>.trycloudflare.com` URL. The URL changes every restart. Good for testing.

```sh
curl -X POST "https://<random>.trycloudflare.com/pump?seconds=5" -H "X-Token: $TOKEN"
```

### Named tunnel (fixed hostname)

Requires a Cloudflare account and a domain on Cloudflare.

```sh
cloudflared tunnel login
cloudflared tunnel create plantpump
cloudflared tunnel route dns plantpump pump.example.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: plantpump
credentials-file: /home/pi/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: pump.example.com
    service: http://192.168.1.50:80
  - service: http_status:404
```

```sh
cloudflared tunnel run plantpump
# on Linux, run at boot:
sudo cloudflared service install
```

Then: `curl -X POST "https://pump.example.com/pump?seconds=5" -H "X-Token: $TOKEN"`.

### Security notes

- The token is the only protection once the device is on the internet. Use a long random value and prefer the `X-Token` header; query-string tokens end up in logs and browser history.
- The tunnel gives HTTPS to the client; the hop from the tunnel host to the ESP32 is plain HTTP on your LAN.
- `/status` is unauthenticated and reveals pump state and LAN IP.
- Consider Cloudflare Access in front of the named tunnel for an extra layer.
