import { personaConfig } from '@/config/persona.config';

export interface HomeAgent {
  slug: string;
  name: string;
  subtitle: string;
  startLabel: string;
}

const { english } = personaConfig.moods;
// Set per instance by run-two.sh, e.g. groot.vantaraa.eth.
const ensName = process.env.NEXT_PUBLIC_ENS_NAME;
const name = ensName || personaConfig.heroTitle;

export const GROOT: HomeAgent = {
  slug: 'groot',
  name,
  subtitle: english.heroSubtitle,
  startLabel: 'Start',
};

export const firstName = (agent: HomeAgent) => agent.name.split(' ')[0];
