import { encodeAbiParameters, encodeFunctionData, keccak256, labelhash, parseEventLogs, stringToHex, toHex, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { packetToBytes } from 'viem/ens'
import { ENS_V2_SEPOLIA as A } from './addresses.js'
import { GUARDIAN_REGISTRY_ROLES, GUARDIAN_RESOLVER_ROLES, PLANT_TOKEN_ROLES, ZERO_G_COIN_TYPE } from './roles.js'
import { PLANTS_KEY, SIGNAL, parseReservoir, parseSignal, reservoirKey, signalKey, type SignalCode } from './signal.js'
import resolverAbi from './abi/PermissionedResolver.json' with { type: 'json' }
import userRegistryAbi from './abi/UserRegistry.json' with { type: 'json' }
import factoryAbi from './abi/VerifiableFactory.json' with { type: 'json' }
import registrarAbi from './abi/ETHRegistrar.json' with { type: 'json' }
import ethRegistryAbi from './abi/ETHRegistry.json' with { type: 'json' }

const erc20Abi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

export type Clients = { pub: PublicClient; wallet: WalletClient }
export type Plant = { label: string; agent: Address; wallet: Address; persona: string; species: string }
export type Forest = { name: string; label: string; resolver: Address; registry: Address }

export const dnsName = (name: string): Hex => toHex(packetToBytes(name))
const saltOf = (seed: string) => BigInt(keccak256(stringToHex(seed)))

async function send(c: Clients, req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  const { request } = await c.pub.simulateContract({ ...req, account: c.wallet.account! } as never)
  const hash = await c.wallet.writeContract(request as never)
  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${req.functionName} reverted in ${hash}`)
  return receipt
}

async function deployProxy(c: Clients, impl: Address, seed: string, data: Hex): Promise<Address> {
  const receipt = await send(c, { address: A.VerifiableFactory, abi: factoryAbi, functionName: 'deployProxy', args: [impl, saltOf(seed), data] })
  const event = parseEventLogs({ abi: factoryAbi as never, logs: receipt.logs }).find((l) => (l as { eventName: string }).eventName === 'ProxyDeployed') as { args: { proxyAddress: Address } } | undefined
  if (!event) throw new Error('ProxyDeployed event missing')
  return event.args.proxyAddress
}

export const setTextCall = (name: string, key: string, value: string) =>
  encodeFunctionData({ abi: resolverAbi, functionName: 'setText', args: [dnsName(name), key, value] })

export const setAddressCall = (name: string, address: Address) =>
  encodeFunctionData({ abi: resolverAbi, functionName: 'setAddress', args: [dnsName(name), ZERO_G_COIN_TYPE, address] })

export async function registerEthName(c: Clients, label: string, subregistry: Address, resolver: Address, durationS: bigint, waitForCommit: () => Promise<void>) {
  const owner = c.wallet.account!.address
  const secret = keccak256(stringToHex(`${label}:${owner}:${Date.now()}`))
  const referrer = `0x${'00'.repeat(32)}` as Hex
  const commitment = keccak256(encodeAbiParameters(
    [{ type: 'string' }, { type: 'address' }, { type: 'bytes32' }, { type: 'address' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes32' }],
    [label, owner, secret, subregistry, resolver, durationS, referrer],
  ))
  const [base, premium] = (await c.pub.readContract({ address: A.ETHRegistrar, abi: registrarAbi, functionName: 'getRegisterPrice', args: [label, durationS, A.MockUSDC] })) as [bigint, bigint]
  await send(c, { address: A.MockUSDC, abi: erc20Abi, functionName: 'mint', args: [owner, base + premium] })
  await send(c, { address: A.MockUSDC, abi: erc20Abi, functionName: 'approve', args: [A.ETHRegistrar, base + premium] })
  await send(c, { address: A.ETHRegistrar, abi: registrarAbi, functionName: 'commit', args: [commitment] })
  await waitForCommit()
  await send(c, { address: A.ETHRegistrar, abi: registrarAbi, functionName: 'register', args: [label, owner, secret, subregistry, resolver, durationS, A.MockUSDC, referrer] })
}

export const ETH_COIN_TYPE = 60n
export const SEPOLIA_COIN_TYPE = 0x80000000n | 11155111n

export const setCoinAddressCall = (name: string, coinType: bigint, address: Address) =>
  encodeFunctionData({ abi: resolverAbi, functionName: 'setAddress', args: [dnsName(name), coinType, address] })

export async function createPersonName(c: Clients, label: string, address: Address, durationS: bigint, waitForCommit: () => Promise<void>) {
  const name = `${label}.eth`
  const owner = c.wallet.account!.address
  const resolver = await deployProxy(c, A.PermissionedResolverImpl, `person-resolver:${name}:${owner}`,
    encodeFunctionData({ abi: resolverAbi, functionName: 'initialize', args: [[{ account: owner, roleBitmap: GUARDIAN_RESOLVER_ROLES }], [
      setCoinAddressCall(name, ETH_COIN_TYPE, address),
      setCoinAddressCall(name, SEPOLIA_COIN_TYPE, address),
    ]] }))
  await registerEthName(c, label, zeroAddress, resolver, durationS, waitForCommit)
  return { name, label, resolver, address }
}

export async function createForest(c: Clients, label: string, durationS: bigint, waitForCommit: () => Promise<void>): Promise<Forest> {
  const name = `${label}.eth`
  const guardian = c.wallet.account!.address
  const resolver = await deployProxy(c, A.PermissionedResolverImpl, `forest-resolver:${name}`,
    encodeFunctionData({ abi: resolverAbi, functionName: 'initialize', args: [[{ account: guardian, roleBitmap: GUARDIAN_RESOLVER_ROLES }], [setTextCall(name, PLANTS_KEY, '')]] }))
  const registry = await deployProxy(c, A.UserRegistryImpl, `forest-registry:${name}`,
    encodeFunctionData({ abi: userRegistryAbi, functionName: 'initialize', args: [[{ account: guardian, roleBitmap: GUARDIAN_REGISTRY_ROLES }]] }))
  await registerEthName(c, label, registry, resolver, durationS, waitForCommit)
  return { name, label, resolver, registry }
}

async function forestExpiry(c: Clients, forest: Forest) {
  return (await c.pub.readContract({ address: A.ETHRegistry, abi: ethRegistryAbi, functionName: 'getExpiry', args: [BigInt(labelhash(forest.label))] })) as bigint
}

export async function addPlant(c: Clients, forest: Forest, plant: Plant, allLabels: string[]) {
  const plantName = `${plant.label}.${forest.name}`
  const expiry = await forestExpiry(c, forest)
  await send(c, { address: forest.registry, abi: userRegistryAbi, functionName: 'register', args: [plant.label, c.wallet.account!.address, zeroAddress, forest.resolver, PLANT_TOKEN_ROLES, expiry] })
  await send(c, {
    address: forest.resolver, abi: resolverAbi, functionName: 'multicall', args: [[
      setAddressCall(plantName, plant.wallet),
      setTextCall(plantName, 'forest.persona', plant.persona),
      setTextCall(plantName, 'forest.species', plant.species),
      setTextCall(forest.name, signalKey(plant.label), SIGNAL.ok),
      setTextCall(forest.name, PLANTS_KEY, allLabels.join(',')),
    ]],
  })
  await send(c, { address: forest.resolver, abi: resolverAbi, functionName: 'grantSetterRoles', args: [setTextCall(forest.name, signalKey(plant.label), ''), plant.agent] })
}

export async function sendSignal(c: Clients, forest: Forest, plantLabel: string, code: SignalCode) {
  const receipt = await send(c, { address: forest.resolver, abi: resolverAbi, functionName: 'setText', args: [dnsName(forest.name), signalKey(plantLabel), code] })
  return receipt.transactionHash
}

export async function setReservoir(c: Clients, forest: Forest, plantLabel: string, ml: number | null) {
  const receipt = await send(c, { address: forest.resolver, abi: resolverAbi, functionName: 'setText', args: [dnsName(forest.name), reservoirKey(plantLabel), ml === null ? '' : String(ml)] })
  return receipt.transactionHash
}

export async function readReservoirs(pub: PublicClient, forestName: string) {
  const labels = ((await pub.getEnsText({ name: forestName, key: PLANTS_KEY })) ?? '').split(',').filter(Boolean)
  return Promise.all(labels.map(async (label) => ({ label, ml: parseReservoir(await pub.getEnsText({ name: forestName, key: reservoirKey(label) })) })))
}

export async function readForest(pub: PublicClient, forestName: string) {
  const labels = ((await pub.getEnsText({ name: forestName, key: PLANTS_KEY })) ?? '').split(',').filter(Boolean)
  const signals = await Promise.all(labels.map(async (label) => ({ label, signal: parseSignal(await pub.getEnsText({ name: forestName, key: signalKey(label) })) })))
  return signals
}

export { resolverAbi }
