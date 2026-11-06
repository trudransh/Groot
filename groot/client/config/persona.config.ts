export const personaConfig = {
  appName: 'Groot',
  tagline: 'Autonomous forest',
  description: 'Talk to Groot.',
  siteUrl: 'http://localhost:3000',

  favicon: {
    svg: '/favicon_io/favicon.svg',
    ico: '/favicon_io/favicon.ico',
    apple: '/favicon_io/apple-touch-icon.png',
  },

  heroTitle: 'Groot',

  moods: {
    english: {
      label: 'English',
      heroSubtitle: 'Autonomous forest',
      startChatButtonLabel: 'Talk with Groot',
      visualizerBgColor: '#3F8F4E',
      endCard: {
        title: 'Session complete',
        motif: 'Thanks for talking with me',
        shareLabel: 'Share on X',
        shareText: 'Just talked with {name}.',
        body: 'Come back anytime.',
        saveLabel: 'Save session',
        againLabel: 'Talk again',
        transcriptTitle: 'Session with {name}',
        transcriptYou: 'You',
        transcriptDate: 'Date',
        transcriptLanguage: 'Language',
      },
      inputPlaceholder: "Say 'Bye' to finish this session",
      sendLabel: 'Send',
      muteLabel: 'Mute {name}',
      unmuteLabel: 'Unmute {name}',
      micMuteLabel: 'Mute your microphone',
      micUnmuteLabel: 'Unmute your microphone',
      endCallLabel: 'End call',
      backLabel: 'Back',
      startingLabel: 'Starting…',
      mic: {
        title: 'Turn on your microphone',
        body: 'So {name} can hear you.',
        allow: 'Allow',
        waiting: 'Waiting…',
        cancel: 'Not now',
        retry: 'Try again',
        blocked: 'Your microphone is blocked. Allow it from the icon in the address bar, then try again.',
        missing: 'No microphone found. Connect one and try again.',
      },
    },
  },
};

export type PersonaConfig = typeof personaConfig;
export type MoodKey = keyof typeof personaConfig.moods;
