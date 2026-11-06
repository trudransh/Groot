"""MCP server (stdio) giving an agent its own Sepolia wallet: address, ETH/USDC balances, transfers.

Run: GROOT_PRIVATE_KEY=0x... SEPOLIA_RPC_URL=... uv run -m voice_agent.wallet_mcp
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from voice_agent import sepolia_wallet as sw

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


@server.tool()
async def wallet_transfer(to: str, amount: str, token: str = "ETH") -> str:
    """Send ETH or USDC from your wallet to a 0x address on Sepolia. amount is in whole units, e.g. "0.01" or "5".
    Real funds move: only send when the person clearly asked and confirmed the amount and recipient.
    Returns the transaction hash once broadcast (not yet confirmed)."""
    r = await sw.transfer(to, amount, token)
    return f"Sent {r['sent']} to {r['to']}. Broadcast, not yet confirmed. Hash: {r['hash']} ({r['explorer']})"


if __name__ == "__main__":
    server.run("stdio")
