import { spawn } from 'node:child_process'
import { BaseError, ContractFunctionRevertedError, createPublicClient, createTestClient, createWalletClient, http, keccak256, stringToHex, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { addPlant, createForest, dnsName, readForest, resolverAbi, sendSignal, setTextCall, type Clients, type Forest, type Plant } from './forest.js'
import { RESOLVER, ZERO_G_COIN_TYPE } from './roles.js'
import { PLANTS_KEY, SIGNAL, parseSignal, signalKey } from './signal.js'

const PORT = 8547
const FORK = process.env.SEPOLIA_FORK_URL || 'https://sepolia.gateway.tenderly.co'
const anvil = spawn('anvil', ['--fork-url', FORK, '--port', String(PORT), '--silent', '--timeout', '60000'], { stdio: 'inherit' })
process.on('exit', () => anvil.kill())

const transport = http(`http://127.0.0.1:${PORT}`, { timeout: 120_000 })
const pub = createPublicClient({ chain: sepolia, transport })
const test = createTestClient({ chain: sepolia, transport, mode: 'anvil' })
for (let i = 0; i < 120 && !(await pub.getChainId().then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 500))


const as = (): Clients => ({ pub: pub as never, wallet: createWalletClient({ chain: sepolia, transport, account: privateKeyToAccount(generatePrivateKey()) }) })
const guardian = as()
const banyan = as()
const tulsi = as()
const stranger = as()
for (const c of [guardian, banyan, tulsi, stranger]) await test.setBalance({ address: c.wallet.account!.address, value: 10n ** 18n })

const plants: Plant[] = [
  { label: 'banyan-01', agent: banyan.wallet.account!.address, wallet: '0x00000000000000000000000000000000000000b1', persona: 'calm elder', species: 'banyan' },
  { label: 'tulsi-04', agent: tulsi.wallet.account!.address, wallet: '0x00000000000000000000000000000000000000b2', persona: 'shy sapling', species: 'tulsi' },
]

const results: [string, boolean, string][] = []
const check = (name: string, ok: boolean, detail = '') => results.push([name, ok, detail])

async function expectRevert(name: string, c: Clients, address: Address, functionName: string, args: readonly unknown[], expected = 'EACUnauthorizedAccountRoles') {
  try {
    await c.pub.simulateContract({ address, abi: resolverAbi as never, functionName, args, account: c.wallet.account! } as never)
    check(name, false, 'call succeeded, expected revert')
  } catch (e) {
    const reverted = e instanceof BaseError ? (e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null) : null
    const errorName = reverted?.data?.errorName ?? 'unknown'
    check(name, errorName === expected, `reverted with ${errorName}`)
  }
}

const signalOf = async (forest: Forest, label: string) => (await readForest(pub as never, forest.name)).find((p) => p.label === label)?.signal

try {
  const forest = await createForest(guardian, 'vantaraa', 2_419_200n, async () => {
    await test.increaseTime({ seconds: 61 })
    await test.mine({ blocks: 1 })
  })
  console.log('forest', forest)
  for (let i = 0; i < plants.length; i++) await addPlant(guardian, forest, plants[i]!, plants.slice(0, i + 1).map((p) => p.label))

  const view = await readForest(pub as never, forest.name)
  check('discover plants and signals from vantaraa.eth', JSON.stringify(view) === JSON.stringify([{ label: 'banyan-01', signal: '0' }, { label: 'tulsi-04', signal: '0' }]), JSON.stringify(view))
  const wallet = await pub.getEnsAddress({ name: `banyan-01.${forest.name}`, coinType: ZERO_G_COIN_TYPE })
  check('banyan-01.vantaraa.eth resolves to its 0G wallet', wallet?.toLowerCase() === plants[0]!.wallet, String(wallet))
  check('plant subdomain keeps its persona', (await pub.getEnsText({ name: `banyan-01.${forest.name}`, key: 'forest.persona' })) === 'calm elder')

  const tx = await sendSignal(banyan, forest, 'banyan-01', SIGNAL.thirsty)
  check('banyan sends distress (signal.banyan-01 = 1)', (await signalOf(forest, 'banyan-01')) === '1', `tx ${tx}`)
  check('tulsi is untouched', (await signalOf(forest, 'tulsi-04')) === '0')

  const forestDns = dnsName(forest.name)
  await expectRevert("BREAK banyan fakes tulsi's distress", banyan, forest.resolver, 'setText', [forestDns, signalKey('tulsi-04'), '1'])
  await expectRevert('BREAK banyan rewrites the plant list', banyan, forest.resolver, 'setText', [forestDns, PLANTS_KEY, 'banyan-01'])
  await expectRevert('BREAK banyan edits its own persona', banyan, forest.resolver, 'setText', [dnsName(`banyan-01.${forest.name}`), 'forest.persona', 'evil'])
  await expectRevert('BREAK banyan redirects its wallet address', banyan, forest.resolver, 'setAddress', [dnsName(`banyan-01.${forest.name}`), ZERO_G_COIN_TYPE, '0x00000000000000000000000000000000000000ee'])
  await expectRevert('BREAK stranger clears banyan distress', stranger, forest.resolver, 'setText', [forestDns, signalKey('banyan-01'), '0'])
  await expectRevert('BREAK banyan grants itself root text role', banyan, forest.resolver, 'grantRootRoles', [RESOLVER.SET_TEXT, banyan.wallet.account!.address], 'EACCannotGrantRoles')
  await expectRevert("BREAK banyan grants itself tulsi's key", banyan, forest.resolver, 'grantSetterRoles', [setTextCall(forest.name, signalKey('tulsi-04'), ''), banyan.wallet.account!.address], 'EACCannotGrantRoles')

  await sendSignal(banyan, { ...forest, name: `tulsi-04.${forest.name}` }, 'banyan-01', SIGNAL.thirsty)
  check('QUIRK banyan writes its key on tulsi-04 name: readers ignore it', (await signalOf(forest, 'tulsi-04')) === '0', 'write allowed by ENS, forest view unchanged')

  await sendSignal(banyan, forest, 'banyan-01', 'lol' as never)
  check('QUIRK banyan writes junk to its own key: reader rejects it', (await signalOf(forest, 'banyan-01')) === null && parseSignal('lol') === null, 'ENS stores it, parseSignal returns null')

  await sendSignal(guardian, forest, 'banyan-01', SIGNAL.ok)
  check('guardian can reset banyan signal', (await signalOf(forest, 'banyan-01')) === '0')

  const tulsiKeyResource = BigInt(keccak256(stringToHex(signalKey('tulsi-04'))))
  const { request } = await pub.simulateContract({ address: forest.resolver, abi: resolverAbi as never, functionName: 'revokeRoles', args: [tulsiKeyResource, RESOLVER.SET_TEXT, tulsi.wallet.account!.address], account: guardian.wallet.account! } as never)
  await pub.waitForTransactionReceipt({ hash: await guardian.wallet.writeContract(request as never) })
  await expectRevert('guardian revokes tulsi: tulsi can no longer signal', tulsi, forest.resolver, 'setText', [forestDns, signalKey('tulsi-04'), '1'])
} catch (e) {
  check('setup', false, e instanceof Error ? e.message.split('\n').slice(0, 4).join(' | ') : String(e))
}

for (const [name, ok, detail] of results) console.log(ok ? 'PASS' : 'FAIL', name, detail ? `(${detail})` : '')
anvil.kill()
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
