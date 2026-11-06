import { personaConfig } from '@/config/persona.config';

export interface HomeAgent {
  slug: string;
  name: string;
  subtitle: string;
  startLabel: string;
}

const { english } = personaConfig.moods;

export const GROOT: HomeAgent = {
  slug: 'groot',
  name: personaConfig.heroTitle,
  subtitle: english.heroSubtitle,
  startLabel: english.startChatButtonLabel,
};

export const firstName = (agent: HomeAgent) => agent.name.split(' ')[0];
