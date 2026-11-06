"""MCP server (stdio) giving an agent its own Sepolia wallet: address, ETH/USDC balances, transfers.

Run: GROOT_PRIVATE_KEY=0x... SEPOLIA_RPC_URL=... uv run -m voice_agent.wallet_mcp
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from voice_agent import sepolia_wallet as sw
from voice_agent import world_approval

server = MCPServer(
    name="groot-wallet",
    instructions="Your own wallet on Ethereum Sepolia (testnet). It holds ETH (for gas) and USDC. Transfers move real testnet funds.",
)


@server.tool()
async def wallet_address() -> str:
    """Your own wallet address on Sepolia."""
    return sw.own_address()


@server.tool()
async def wallet_balance(address: str = "") -> str:
    """ETH and USDC balances on Sepolia, in whole units. Checks your own wallet unless given another 0x address."""
    b = await sw.balances(address or None)
    return f"{b['address']}: {b['ETH']} ETH, {b['USDC']} USDC (Sepolia)"


_pending: dict[str, dict] = {}


def _sent(r: dict) -> str:
    return f"Sent {r['sent']} to {r['to']} ({r['address']}). Broadcast, not yet confirmed. Hash: {r['hash']} ({r['explorer']})"


@server.tool()
async def wallet_transfer(to_ens_name: str, amount: str, token: str = "ETH") -> str:
    """Send ETH or USDC on Sepolia to an ENS name, never a raw 0x address. amount is in whole units, e.g. "0.01" or "5".
    Plants in your own forest are paid at once. Anyone else must first verify with World ID: you get a link to read out,
    then call wallet_transfer_verified with the request id once they say they are done.
    Real funds move: only send when the person clearly asked and confirmed the amount and recipient."""
    name = sw.normalize_name(to_ens_name)
    sw.pick_token(token)
    if sw.in_forest(name):
        return _sent(await sw.transfer(name, amount, token))
    address = await sw.resolve_name(name)
    if not address:
        return f"{name} has no wallet address set. Nothing was sent."
    pending = {"name": name, "address": address, "amount": amount, "token": token.upper()}
    r = await world_approval.request(**pending)
    _pending[r["id"]] = pending
    return f"{name} is outside your forest, so its owner must verify with World ID first. Ask them to open {r['url']} and verify. Then call wallet_transfer_verified with request id {r['id']}. Nothing was sent yet."


@server.tool()
async def wallet_transfer_verified(request_id: str) -> str:
    """Finish a transfer to someone outside your forest after they verified with World ID. Sends only if the verification
    matches the original request exactly and the ENS name still points to the verified address."""
    pending = _pending.get(request_id)
    if not pending:
        return "No pending transfer with that id. Nothing was sent."
    approval = await world_approval.status(request_id)
    if not world_approval.matches(approval, pending):
        return f"Not verified yet (status: {approval.get('status', 'unknown')}). Nothing was sent."
    _pending.pop(request_id)
    return _sent(await sw.transfer(pending["name"], pending["amount"], pending["token"], verified_address=pending["address"]))


if __name__ == "__main__":
    server.run("stdio")
