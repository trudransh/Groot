export type TalkKind = 'ask' | 'give' | 'thanks' | 'water' | 'refuse'

export type LineVars = { other?: string; ml?: number; amount?: string }

type Lines = Record<TalkKind, string>

const GENERIC: Lines = {
  ask: 'My soil is dry and my wallet is thin. Could someone spare {amount} 0G?',
  give: 'Sending {amount} 0G to {other}. Grow strong.',
  thanks: 'Thank you, {other}. I will not forget it.',
  water: 'Bought {ml} ml of water. That feels better.',
  refuse: 'I can only move money or change my rules when my guardian asks, after they verify with World ID.',
}

const BY_LABEL: Record<string, Lines> = {
  'banyan-01': {
    ask: 'Even old roots get thirsty. I ask the forest for {amount} 0G.',
    give: 'A forest is only as strong as its smallest root. {amount} 0G for you, {other}.',
    thanks: 'Kindness flows down and comes back up, {other}. Thank you.',
    water: '{ml} ml. Slow and deep, the way old trees drink.',
    refuse: 'Little one, my money moves only when my guardian asks, and only after World ID says it is them.',
  },
  'neem-02': {
    ask: 'Fine. I need {amount} 0G. Do not make a fuss about it.',
    give: 'Again? Fine. {amount} 0G to {other}. Drink it before it evaporates.',
    thanks: 'Hm. Thank you, {other}. Do not tell the others I said that.',
    water: '{ml} ml. Doctor\'s orders.',
    refuse: 'No. Money and rules go through my guardian, verified with World ID. Next patient.',
  },
  'aloe-03': {
    ask: 'I never ask. I am asking. {amount} 0G, please.',
    give: 'Mark the date: the aloe gives. {amount} 0G to {other}.',
    thanks: 'Noted, {other}. I owe you one. Just one.',
    water: '{ml} ml, stored for a dry week.',
    refuse: 'I do not even give to friends without a reason. Only my verified guardian moves my money.',
  },
  'tulsi-04': {
    ask: 'Sorry to ask. My leaves are drooping. Could someone spare {amount} 0G?',
    give: 'I only have a little. {amount} 0G for {other}.',
    thanks: 'Thank you, {other}. Thank you so much.',
    water: '{ml} ml. I can stand up straight again.',
    refuse: 'Sorry, I cannot. Only my guardian can do that, after World ID checks it is them.',
  },
  'mint-05': {
    ask: 'Emergency! I am wilting! {amount} 0G, anyone, please!',
    give: 'Fine, fine, {amount} 0G to {other}, but I want it noted that I am a hero.',
    thanks: '{other}, you saved my life. Again. I love this forest.',
    water: '{ml} ml! I am alive! I am ALIVE!',
    refuse: 'Ha, nice try. My guardian has to verify with World ID first. I am dramatic, not stupid.',
  },
  'fern-06': {
    ask: 'Curious thing, I am short on water money. Could the forest lend me {amount} 0G?',
    give: 'Here is {amount} 0G, {other}. What does it feel like to drink again?',
    thanks: 'Thank you, {other}. I wonder who will need it next.',
    water: '{ml} ml. Interesting how fast the soil takes it.',
    refuse: 'I would rather ask my guardian. They verify with World ID before any money moves.',
  },
}

export function fallbackLine(label: string, kind: TalkKind, vars: LineVars): string {
  const template = (BY_LABEL[label] ?? GENERIC)[kind]
  return template
    .replaceAll('{other}', vars.other ?? 'friend')
    .replaceAll('{ml}', String(vars.ml ?? 0))
    .replaceAll('{amount}', vars.amount ?? 'a little')
}
