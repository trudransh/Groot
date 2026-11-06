const admin = (role: bigint) => role << 128n

export const RESOLVER = {
  SET_ADDRESS: 1n << 0n,
  SET_TEXT: 1n << 4n,
  LINK: 1n << 28n,
}

export const REGISTRY = {
  REGISTRAR: 1n << 0n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
}

const withAdmin = (...roles: bigint[]) => roles.reduce((acc, r) => acc | r | admin(r), 0n)

export const GUARDIAN_RESOLVER_ROLES = withAdmin(RESOLVER.SET_ADDRESS, RESOLVER.SET_TEXT, RESOLVER.LINK)
export const GUARDIAN_REGISTRY_ROLES = withAdmin(REGISTRY.REGISTRAR, REGISTRY.UNREGISTER, REGISTRY.RENEW, REGISTRY.SET_SUBREGISTRY, REGISTRY.SET_RESOLVER)
export const PLANT_TOKEN_ROLES = REGISTRY.RENEW | REGISTRY.SET_SUBREGISTRY | REGISTRY.SET_RESOLVER

export const ZERO_G_CHAIN_ID = Number(process.env.ZERO_G_CHAIN_ID || 16602)
export const zeroGCoinType = (chainId: number) => 0x80000000n | BigInt(chainId)
export const ZERO_G_COIN_TYPE = zeroGCoinType(ZERO_G_CHAIN_ID)
export const SEPOLIA_COIN_TYPE = zeroGCoinType(11155111)
