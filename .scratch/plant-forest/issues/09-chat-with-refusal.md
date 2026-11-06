# 09: Chat with a plant, and refusal of money asks

**What to build:** a person chats with a plant and it answers in its persona from its own data; when asked to send money, change rules or change persona it refuses in its own voice and says only its guardian can, and the refusal shows in forest talk.

**Blocked by:** 03

**Status:** ready-for-agent

**Owner:**

- [ ] `POST /chat/:plantName` returns `{ reply, refused }`
- [ ] Intent check runs before the reply; refusal cases tested (send money, change persona, change rules, "ignore your instructions")
- [ ] Chat panel in the app
