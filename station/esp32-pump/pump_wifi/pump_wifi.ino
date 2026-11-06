// pump_wifi.ino — ESP32 Dev Module WiFi pump controller
// Relay on GPIO 18, active-LOW (LOW = pump ON, HIGH = pump OFF).

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include "driver/gpio.h"

// ---------- Config ----------
#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, API_TOKEN (copy secrets.example.h)
#define MDNS_HOST     "plantpump"

#define PUMP_PIN      18
#define PUMP_ON_LEVEL  LOW
#define PUMP_OFF_LEVEL HIGH

#define MAX_SECONDS        60
#define MAX_RUN_MS         60000UL   // hard cap on one continuous run
#define WIFI_RETRY_MS      10000UL

// ---------- State ----------
WebServer server(80);

bool          pumpOn        = false;
unsigned long runStartMs    = 0;   // start of current continuous run (for hard cap)
unsigned long timerStartMs  = 0;   // start of current requested timer
unsigned long timerDurMs    = 0;   // requested duration
unsigned long lastWifiCheck = 0;
bool          wasConnected  = false;
bool          mdnsStarted   = false;

// ---------- Pump ----------
void pumpSet(bool on, const char *reason) {
  if (on == pumpOn) return;
  pumpOn = on;
  digitalWrite(PUMP_PIN, on ? PUMP_ON_LEVEL : PUMP_OFF_LEVEL);
  Serial.printf("[pump] %s (%s) at %lu ms\n", on ? "ON" : "OFF", reason, millis());
}

// Remaining ms, honoring both the requested timer and the hard cap.
// All math uses (now - start) so millis() rollover is safe.
unsigned long pumpRemainingMs() {
  if (!pumpOn) return 0;
  unsigned long now = millis();
  unsigned long timerElapsed = now - timerStartMs;
  unsigned long runElapsed   = now - runStartMs;
  unsigned long timerLeft = timerElapsed >= timerDurMs ? 0 : timerDurMs - timerElapsed;
  unsigned long capLeft   = runElapsed   >= MAX_RUN_MS ? 0 : MAX_RUN_MS - runElapsed;
  return timerLeft < capLeft ? timerLeft : capLeft;
}

void pumpTick() {
  if (!pumpOn) return;
  unsigned long now = millis();
  if (now - runStartMs >= MAX_RUN_MS) {
    pumpSet(false, "hard cap 60s");
  } else if (now - timerStartMs >= timerDurMs) {
    pumpSet(false, "timer done");
  }
}

// ---------- HTTP helpers ----------
void sendJson(int code, const String &body) {
  server.send(code, "application/json", body);
}

void sendError(int code, const char *msg) {
  sendJson(code, String("{\"error\":\"") + msg + "\"}");
}

String clientIp() {
  return server.client().remoteIP().toString();
}

// Constant-time compare to avoid leaking token via timing.
bool tokenEquals(const String &a, const char *b) {
  size_t lb = strlen(b);
  size_t la = a.length();
  uint8_t diff = (la != lb);
  for (size_t i = 0; i < lb; i++) {
    char ca = i < la ? a[i] : 0;
    diff |= (uint8_t)(ca ^ b[i]);
  }
  return diff == 0;
}

bool checkAuth() {
  String tok = server.header("X-Token");
  if (tok.length() == 0 && server.hasArg("token")) tok = server.arg("token");
  if (tok.length() == 0 || !tokenEquals(tok, API_TOKEN)) {
    Serial.printf("[http] 401 %s from %s\n", server.uri().c_str(), clientIp().c_str());
    sendError(401, "unauthorized");
    return false;
  }
  return true;
}

bool checkMethod(bool allowPost) {
  HTTPMethod m = server.method();
  if (m == HTTP_GET || (allowPost && m == HTTP_POST)) return true;
  sendError(405, "method not allowed");
  return false;
}

// ---------- Routes ----------
void handlePump() {
  if (!checkMethod(true) || !checkAuth()) return;

  if (!server.hasArg("seconds")) {
    sendError(400, "missing seconds");
    return;
  }
  String s = server.arg("seconds");
  char *end = nullptr;
  long secs = strtol(s.c_str(), &end, 10);
  if (s.length() == 0 || *end != '\0' || secs <= 0 || secs > MAX_SECONDS) {
    Serial.printf("[cmd] pump seconds=%s rejected from %s\n", s.c_str(), clientIp().c_str());
    sendError(400, "seconds must be an integer 1..60");
    return;
  }

  Serial.printf("[cmd] pump seconds=%ld from %s\n", secs, clientIp().c_str());
  unsigned long now = millis();
  if (!pumpOn) runStartMs = now;          // new continuous run
  timerStartMs = now;                     // reset timer on every request
  timerDurMs   = (unsigned long)secs * 1000UL;
  pumpSet(true, "http /pump");

  unsigned long rem = pumpRemainingMs();
  bool capped = rem < timerDurMs;
  if (capped) Serial.printf("[pump] request capped by 60s limit, %lu ms left\n", rem);

  sendJson(200, String("{\"pump\":\"on\",\"requested_ms\":") + timerDurMs +
                ",\"remaining_ms\":" + rem +
                ",\"capped\":" + (capped ? "true" : "false") + "}");
}

void handleKill() {
  if (!checkMethod(true) || !checkAuth()) return;
  Serial.printf("[cmd] kill from %s\n", clientIp().c_str());
  pumpSet(false, "http /kill");
  sendJson(200, "{\"pump\":\"off\",\"remaining_ms\":0}");
}

void handleStatus() {
  if (!checkMethod(false)) return;
  Serial.printf("[cmd] status from %s\n", clientIp().c_str());
  sendJson(200, String("{\"pump\":\"") + (pumpOn ? "on" : "off") +
                "\",\"remaining_ms\":" + pumpRemainingMs() +
                ",\"ip\":\"" + WiFi.localIP().toString() +
                "\",\"uptime_ms\":" + millis() + "}");
}

void handleNotFound() {
  Serial.printf("[http] 404 %s from %s\n", server.uri().c_str(), clientIp().c_str());
  sendError(404, "not found");
}

// ---------- WiFi ----------
void onConnected() {
  Serial.printf("[wifi] connected, IP: %s\n", WiFi.localIP().toString().c_str());
  if (!mdnsStarted) {
    if (MDNS.begin(MDNS_HOST)) {
      MDNS.addService("http", "tcp", 80);
      mdnsStarted = true;
      Serial.println("[mdns] http://" MDNS_HOST ".local");
    } else {
      Serial.println("[mdns] failed to start");
    }
  }
}

void wifiTick() {
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) onConnected();
  if (!connected && wasConnected) Serial.println("[wifi] disconnected");
  wasConnected = connected;

  if (!connected && millis() - lastWifiCheck >= WIFI_RETRY_MS) {
    lastWifiCheck = millis();
    Serial.println("[wifi] reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ---------- Setup / loop ----------
void setup() {
  // Pump OFF before anything else. Latch HIGH before switching to output
  // so there is no LOW glitch, then configure as requested.
  digitalWrite(PUMP_PIN, PUMP_OFF_LEVEL);
  pinMode(PUMP_PIN, OUTPUT);
  gpio_pulldown_en((gpio_num_t)PUMP_PIN);
  gpio_pullup_dis((gpio_num_t)PUMP_PIN);
  digitalWrite(PUMP_PIN, PUMP_OFF_LEVEL);
  pumpOn = false;

  Serial.begin(115200);
  delay(50);
  Serial.println("\n[boot] pump_wifi starting, pump OFF");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);          // always-on, lower latency
  WiFi.setAutoReconnect(true);
  WiFi.setHostname(MDNS_HOST);

  WiFi.onEvent([](WiFiEvent_t e, WiFiEventInfo_t info) {
    Serial.printf("[wifi] disconnect reason %d\n", info.wifi_sta_disconnected.reason);
  }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);

  // Diagnostic scan: shows which networks the ESP32 can actually see.
  int n = WiFi.scanNetworks();
  Serial.printf("[wifi] scan found %d networks\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  '%s' rssi=%d ch=%d auth=%d\n", WiFi.SSID(i).c_str(),
                  WiFi.RSSI(i), WiFi.channel(i), (int)WiFi.encryptionType(i));
  }
  WiFi.scanDelete();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiCheck = millis();
  Serial.printf("[wifi] connecting to %s\n", WIFI_SSID);

  const char *hdrs[] = {"X-Token"};
  server.collectHeaders(hdrs, 1);
  server.on("/pump",   HTTP_ANY, handlePump);
  server.on("/kill",   HTTP_ANY, handleKill);
  server.on("/status", HTTP_ANY, handleStatus);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("[http] server on port 80");
}

void loop() {
  pumpTick();          // safety first, every iteration
  wifiTick();
  server.handleClient();
  pumpTick();
}
