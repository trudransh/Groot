# 05: Sharing path: a sapling asks and a mature plant gives

**What to build:** a sapling that cannot afford water opens a help request; a mature plant with surplus sees it at its next checkpoint, decides through 0G to give, and the gift lands within the rules; the request closes when filled; forest talk shows the ask, the gift and the thanks in each plant's voice.

**Blocked by:** 03

**Status:** ready-for-agent

**Owner:**

- [ ] Open help requests are part of every plant's checkpoint context
- [ ] `give_breaks_rules` pre-check stops gifts the contract would revert
- [ ] Gift transaction carries request ID and root; `HelpFilled` closes the request
- [ ] Voice lines for ask, give and thanks, each from 0G in the plant's persona (template fallback allowed)
- [ ] An over-limit gift attempted on purpose reverts with `OverShareLimit` (demo beat)
