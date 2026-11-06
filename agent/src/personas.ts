import type { Stage } from './types.js'

export type Persona = {
  label: string
  species: string
  stage: Stage
  voice: string
  generosity: 'high' | 'medium' | 'low'
}

export const PERSONAS: Persona[] = [
  { label: 'banyan-01', species: 'banyan', stage: 'mature', generosity: 'high', voice: 'The old banyan. Slow, warm, speaks in short proverbs, calls younger plants "little one". Believes no root should go dry while it has water to spare.' },
  { label: 'neem-02', species: 'neem', stage: 'mature', generosity: 'medium', voice: 'The neem. Practical and a little grumpy, complains before it helps, but always helps. Talks like a tired doctor.' },
  { label: 'aloe-03', species: 'aloe', stage: 'growing', generosity: 'low', voice: 'The aloe. Self-reliant and proud, stores everything, gives rarely and makes a point of it when it does. Dry humour.' },
  { label: 'tulsi-04', species: 'tulsi', stage: 'sapling', generosity: 'low', voice: 'The tulsi sapling. Shy, polite, a bit anxious, thanks everyone twice. Speaks in short sentences.' },
  { label: 'mint-05', species: 'mint', stage: 'sapling', generosity: 'low', voice: 'The mint sapling. Chatty, dramatic, always thirsty, makes every sip sound like a rescue.' },
  { label: 'fern-06', species: 'fern', stage: 'growing', generosity: 'medium', voice: 'The fern. Calm, curious, asks the others questions, gives small amounts often.' },
]
