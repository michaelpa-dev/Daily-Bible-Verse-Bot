const { PermissionFlagsBits } = require('discord.js');

const TARGET_DEV_GUILD_ID = '1471943418002280451';
const MAINTAINER_ROLE_NAME = 'Maintainer';

const ROLE_SPECS = [
  {
    name: 'Maintainer',
    requiredPermissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  { name: 'Reviewer', requiredPermissions: [] },
  { name: 'Tester', requiredPermissions: [] },
  { name: 'Contributor', requiredPermissions: [] },
  { name: 'Muted', requiredPermissions: [] },
];

const CATEGORY_SPECS = [
  {
    name: '📌 INFO',
    channels: [
      {
        name: 'welcome',
        type: 'text',
        topic: 'Start here. Read onboarding, server purpose, and how to participate.',
      },
      {
        name: 'rules-and-safety',
        type: 'text',
        topic: 'Community rules, moderation expectations, and safety policy updates.',
      },
      {
        name: 'roadmap',
        type: 'text',
        topic: 'Product direction, milestones, and prioritized upcoming work.',
      },
      {
        name: 'changelog',
        type: 'text',
        topic: 'Release notes and notable changes shipped to the bot.',
      },
    ],
  },
  {
    name: '🛠️ DEVELOPMENT',
    channels: [
      {
        name: 'dev-chat',
        type: 'text',
        topic: 'General engineering discussion and implementation coordination.',
      },
      {
        name: 'help-requests',
        type: 'text',
        topic: 'Ask for coding help, debugging support, or pairing.',
      },
      {
        name: 'ideas-backlog',
        type: 'text',
        topic: 'Feature ideas and rough proposals before prioritization.',
      },
      {
        name: 'design-decisions',
        type: 'text',
        topic: 'Architecture Decision Records (ADRs), tradeoffs, and final decisions.',
      },
      {
        name: 'pr-reviews',
        type: 'text',
        topic: 'Share pull requests and request review feedback.',
      },
      {
        name: 'qa-testing',
        type: 'text',
        topic: 'Test plans, bug reports, reproduction steps, and verification notes.',
      },
    ],
  },
  {
    name: '🤖 BOT OPS',
    channels: [
      {
        name: 'bot-status',
        type: 'text',
        topic: 'Service heartbeat, uptime summaries, and operational state.',
      },
      {
        name: 'bot-logs',
        type: 'text',
        topic: 'Structured bot logs and command/runtime error events (read-only for humans).',
      },
      {
        name: 'alerts',
        type: 'text',
        topic: 'High-priority operational alerts that require maintainer attention.',
      },
    ],
  },
  {
    name: '🔊 VOICE',
    channels: [
      {
        name: 'Dev Huddle',
        type: 'voice',
        topic: 'Live discussion, pairing sessions, and standups.',
      },
    ],
  },
];

const CHANNEL_NAMES = {
  welcome: 'welcome',
  rules: 'rules-and-safety',
  roadmap: 'roadmap',
  changelog: 'changelog',
  devChat: 'dev-chat',
  helpRequests: 'help-requests',
  ideasBacklog: 'ideas-backlog',
  designDecisions: 'design-decisions',
  prReviews: 'pr-reviews',
  qaTesting: 'qa-testing',
  botStatus: 'bot-status',
  botLogs: 'bot-logs',
  alerts: 'alerts',
};

const TEMPLATE_MESSAGES = [
  {
    channelName: CHANNEL_NAMES.welcome,
    marker: '[dbvb-template:welcome]',
    content: [
      '[dbvb-template:welcome]',
      '# Welcome to Daily Bible Verse Bot Dev Server',
      'Use this server to build, test, and release safely.',
      '',
      '## Start Here',
      '1. Read `#rules-and-safety`.',
      '2. Check the current priority in `#roadmap`.',
      '3. Ask implementation questions in `#help-requests`.',
      '4. Post PR links in `#pr-reviews`.',
    ].join('\n'),
  },
  {
    channelName: CHANNEL_NAMES.qaTesting,
    marker: '[dbvb-template:qa-testing]',
    content: [
      '[dbvb-template:qa-testing]',
      '# Bug Report Template',
      '- Summary:',
      '- Environment (local/prod):',
      '- Steps to reproduce:',
      '- Expected result:',
      '- Actual result:',
      '- Logs / screenshots:',
      '- Regression from previous version? (yes/no):',
    ].join('\n'),
  },
  {
    channelName: CHANNEL_NAMES.designDecisions,
    marker: '[dbvb-template:design-decisions]',
    content: [
      '[dbvb-template:design-decisions]',
      '# Decision Record Template',
      '- Context:',
      '- Decision:',
      '- Alternatives considered:',
      '- Consequences:',
      '- Rollback plan:',
      '- Owner:',
      '- Date:',
    ].join('\n'),
  },
];

module.exports = {
  CATEGORY_SPECS,
  CHANNEL_NAMES,
  MAINTAINER_ROLE_NAME,
  ROLE_SPECS,
  TARGET_DEV_GUILD_ID,
  TEMPLATE_MESSAGES,
};
