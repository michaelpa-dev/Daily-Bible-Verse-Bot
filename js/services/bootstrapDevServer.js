const { ChannelType, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const {
  CATEGORY_SPECS,
  CHANNEL_NAMES,
  MAINTAINER_ROLE_NAME,
  ROLE_SPECS,
  TEMPLATE_MESSAGES,
} = require('../constants/devServerSpec.js');
const { truncateText } = require('./botOps.js');

function createBootstrapReport() {
  return {
    created: [],
    updated: [],
    unchanged: [],
    warnings: [],
  };
}

function addReportItem(report, section, value) {
  report[section].push(value);
}

function roleNameEquals(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function findRoleByName(guild, roleName) {
  return guild.roles.cache.find((role) => roleNameEquals(role.name, roleName)) || null;
}

async function ensureRole(guild, roleSpec, applyChanges, report) {
  let role = findRoleByName(guild, roleSpec.name);
  if (!role) {
    addReportItem(report, 'created', `Role: ${roleSpec.name}`);
    if (applyChanges) {
      role = await guild.roles.create({
        name: roleSpec.name,
        reason: 'Bootstrap dev server roles',
      });
    }
  } else {
    addReportItem(report, 'unchanged', `Role exists: ${roleSpec.name}`);
  }

  if (!role || !roleSpec.requiredPermissions.length) {
    return role;
  }

  const rolePermissions = new PermissionsBitField(role.permissions.bitfield);
  const missingPermissions = roleSpec.requiredPermissions.filter(
    (permission) => !rolePermissions.has(permission)
  );

  if (missingPermissions.length === 0) {
    return role;
  }

  const permissionNames = missingPermissions
    .map(
      (permission) =>
        Object.entries(PermissionFlagsBits).find(([, bit]) => bit === permission)?.[0] ||
        String(permission)
    )
    .join(', ');
  addReportItem(report, 'updated', `Role ${roleSpec.name}: add permissions (${permissionNames})`);

  if (applyChanges) {
    await role.setPermissions(
      rolePermissions.add(missingPermissions),
      'Bootstrap role permissions'
    );
  }

  return role;
}

function findCategoryByName(guild, categoryName) {
  return (
    guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory && roleNameEquals(channel.name, categoryName)
    ) || null
  );
}

function findChannelByName(guild, channelName, channelType) {
  return (
    guild.channels.cache.find(
      (channel) => channel.type === channelType && roleNameEquals(channel.name, channelName)
    ) || null
  );
}

async function ensureCategory(guild, categorySpec, applyChanges, report) {
  let category = findCategoryByName(guild, categorySpec.name);

  if (!category) {
    addReportItem(report, 'created', `Category: ${categorySpec.name}`);
    if (applyChanges) {
      category = await guild.channels.create({
        name: categorySpec.name,
        type: ChannelType.GuildCategory,
        reason: 'Bootstrap dev server categories',
      });
    }
  } else {
    addReportItem(report, 'unchanged', `Category exists: ${categorySpec.name}`);
  }

  return category;
}

async function ensureChannel(guild, category, channelSpec, applyChanges, report) {
  const channelType = channelSpec.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
  let channel = findChannelByName(guild, channelSpec.name, channelType);

  if (!channel) {
    addReportItem(
      report,
      'created',
      `${channelSpec.type.toUpperCase()} #${channelSpec.name} in ${category?.name || 'target category'}`
    );

    if (applyChanges) {
      channel = await guild.channels.create({
        name: channelSpec.name,
        type: channelType,
        parent: category?.id,
        topic: channelType === ChannelType.GuildText ? channelSpec.topic : undefined,
        reason: 'Bootstrap dev server channels',
      });
    }
    return channel;
  }

  if (category && channel.parentId !== category.id) {
    addReportItem(report, 'updated', `Channel #${channel.name}: move to category ${category.name}`);
    if (applyChanges) {
      await channel.setParent(category.id, { lockPermissions: false });
    }
  }

  if (
    channelType === ChannelType.GuildText &&
    typeof channelSpec.topic === 'string' &&
    channelSpec.topic.trim().length > 0 &&
    channel.topic !== channelSpec.topic
  ) {
    addReportItem(report, 'updated', `Channel #${channel.name}: update topic`);
    if (applyChanges) {
      await channel.setTopic(channelSpec.topic, 'Bootstrap channel topics');
    }
  }

  addReportItem(report, 'unchanged', `Channel exists: #${channel.name}`);
  return channel;
}

function overwriteSatisfies(overwrite, permissions) {
  if (!overwrite) {
    return false;
  }

  for (const [permission, state] of Object.entries(permissions)) {
    const bit = PermissionFlagsBits[permission];
    if (!bit) {
      continue;
    }

    if (state === true && !overwrite.allow.has(bit)) {
      return false;
    }

    if (state === false && !overwrite.deny.has(bit)) {
      return false;
    }
  }

  return true;
}

async function ensureOverwrite(channel, overwriteTarget, permissions, label, applyChanges, report) {
  if (!channel || !overwriteTarget) {
    return;
  }

  const targetId = typeof overwriteTarget === 'string' ? overwriteTarget : overwriteTarget.id;
  const existingOverwrite = channel.permissionOverwrites.cache.get(targetId);
  if (overwriteSatisfies(existingOverwrite, permissions)) {
    addReportItem(report, 'unchanged', `Overwrite ok: ${label} on #${channel.name}`);
    return;
  }

  addReportItem(report, 'updated', `Overwrite: ${label} on #${channel.name}`);
  if (applyChanges) {
    await channel.permissionOverwrites.edit(overwriteTarget, permissions, {
      reason: 'Bootstrap dev server permission model',
    });
  }
}

function isModerationChannel(channel) {
  const channelName = channel.name.toLowerCase();
  const parentName = channel.parent?.name?.toLowerCase() || '';
  return channelName.includes('mod') || parentName.includes('mod');
}

async function ensurePinnedTemplate(channel, template, applyChanges, report) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  const pinnedMessages = await channel.messages.fetchPinned();
  let templateMessage =
    pinnedMessages.find(
      (message) =>
        message.author.id === channel.client.user.id && message.content.includes(template.marker)
    ) || null;

  if (!templateMessage) {
    const recentMessages = await channel.messages.fetch({ limit: 50 });
    templateMessage =
      recentMessages.find(
        (message) =>
          message.author.id === channel.client.user.id && message.content.includes(template.marker)
      ) || null;
  }

  if (!templateMessage) {
    addReportItem(report, 'created', `Pinned template in #${channel.name}`);
    if (applyChanges) {
      templateMessage = await channel.send({ content: template.content });
      await templateMessage.pin('Bootstrap template pin');
    }
    return;
  }

  if (templateMessage.content !== template.content) {
    addReportItem(report, 'updated', `Template content refreshed in #${channel.name}`);
    if (applyChanges) {
      templateMessage = await templateMessage.edit({ content: template.content });
    }
  } else {
    addReportItem(report, 'unchanged', `Template current in #${channel.name}`);
  }

  if (!templateMessage.pinned) {
    addReportItem(report, 'updated', `Template pinned in #${channel.name}`);
    if (applyChanges) {
      await templateMessage.pin('Bootstrap template pin');
    }
  }
}

async function bootstrapDevServer(guild, options = {}) {
  const applyChanges = options.applyChanges === true;
  const report = createBootstrapReport();

  const rolesByName = new Map();
  for (const roleSpec of ROLE_SPECS) {
    const role = await ensureRole(guild, roleSpec, applyChanges, report);
    if (role) {
      rolesByName.set(roleSpec.name.toLowerCase(), role);
    }
  }

  const channelsByName = new Map();
  for (const categorySpec of CATEGORY_SPECS) {
    const category = await ensureCategory(guild, categorySpec, applyChanges, report);

    for (const channelSpec of categorySpec.channels) {
      const channel = await ensureChannel(guild, category, channelSpec, applyChanges, report);
      if (channel) {
        channelsByName.set(channelSpec.name.toLowerCase(), channel);
      }
    }
  }

  const everyoneRole = guild.roles.everyone;
  const maintainerRole = rolesByName.get(MAINTAINER_ROLE_NAME.toLowerCase());
  const contributorRole = rolesByName.get('contributor');
  const reviewerRole = rolesByName.get('reviewer');
  const testerRole = rolesByName.get('tester');
  const mutedRole = rolesByName.get('muted');

  const infoChannelNames = new Set([
    CHANNEL_NAMES.welcome,
    CHANNEL_NAMES.rules,
    CHANNEL_NAMES.roadmap,
    CHANNEL_NAMES.changelog,
  ]);
  const developmentChannelNames = new Set([
    CHANNEL_NAMES.devChat,
    CHANNEL_NAMES.helpRequests,
    CHANNEL_NAMES.ideasBacklog,
    CHANNEL_NAMES.designDecisions,
    CHANNEL_NAMES.prReviews,
    CHANNEL_NAMES.qaTesting,
  ]);
  const botOpsChannelNames = new Set([
    CHANNEL_NAMES.botStatus,
    CHANNEL_NAMES.botLogs,
    CHANNEL_NAMES.alerts,
  ]);

  for (const channelName of infoChannelNames) {
    const channel = channelsByName.get(channelName.toLowerCase());
    if (!channel) {
      addReportItem(report, 'warnings', `Missing managed channel #${channelName}`);
      continue;
    }

    await ensureOverwrite(
      channel,
      everyoneRole,
      {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false,
      },
      '@everyone read-only',
      applyChanges,
      report
    );

    if (maintainerRole) {
      await ensureOverwrite(
        channel,
        maintainerRole,
        {
          SendMessages: true,
          AddReactions: true,
        },
        'Maintainer write access',
        applyChanges,
        report
      );
    }
  }

  for (const channelName of developmentChannelNames) {
    const channel = channelsByName.get(channelName.toLowerCase());
    if (!channel) {
      addReportItem(report, 'warnings', `Missing managed channel #${channelName}`);
      continue;
    }

    await ensureOverwrite(
      channel,
      everyoneRole,
      {
        ViewChannel: true,
        SendMessages: false,
      },
      '@everyone read-only baseline',
      applyChanges,
      report
    );

    for (const [role, label] of [
      [contributorRole, 'Contributor'],
      [reviewerRole, 'Reviewer'],
      [testerRole, 'Tester'],
      [maintainerRole, 'Maintainer'],
    ]) {
      if (!role) {
        continue;
      }

      await ensureOverwrite(
        channel,
        role,
        {
          SendMessages: true,
          AddReactions: true,
          CreatePublicThreads: true,
          SendMessagesInThreads: true,
        },
        `${label} write access`,
        applyChanges,
        report
      );
    }
  }

  for (const channelName of botOpsChannelNames) {
    const channel = channelsByName.get(channelName.toLowerCase());
    if (!channel) {
      addReportItem(report, 'warnings', `Missing managed channel #${channelName}`);
      continue;
    }

    await ensureOverwrite(
      channel,
      everyoneRole,
      {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false,
      },
      '@everyone read-only in bot ops',
      applyChanges,
      report
    );

    if (maintainerRole && channelName === CHANNEL_NAMES.alerts) {
      await ensureOverwrite(
        channel,
        maintainerRole,
        {
          SendMessages: true,
          AddReactions: true,
        },
        'Maintainer alerts write access',
        applyChanges,
        report
      );
    }
  }

  const botLogChannel = channelsByName.get(CHANNEL_NAMES.botLogs.toLowerCase());
  const botStatusChannel = channelsByName.get(CHANNEL_NAMES.botStatus.toLowerCase());
  const alertsChannel = channelsByName.get(CHANNEL_NAMES.alerts.toLowerCase());

  if (applyChanges) {
    await guild.members.fetch();
  }

  const botMembers = guild.members.cache.filter((member) => member.user.bot);
  for (const botMember of botMembers.values()) {
    if (botLogChannel) {
      await ensureOverwrite(
        botLogChannel,
        botMember,
        {
          SendMessages: true,
          AddReactions: true,
          EmbedLinks: true,
          AttachFiles: true,
        },
        `Bot writer (${botMember.user.username})`,
        applyChanges,
        report
      );
    }

    if (botStatusChannel) {
      await ensureOverwrite(
        botStatusChannel,
        botMember,
        {
          SendMessages: true,
          EmbedLinks: true,
        },
        `Bot status writer (${botMember.user.username})`,
        applyChanges,
        report
      );
    }

    if (alertsChannel) {
      await ensureOverwrite(
        alertsChannel,
        botMember,
        {
          SendMessages: true,
          EmbedLinks: true,
        },
        `Bot alerts writer (${botMember.user.username})`,
        applyChanges,
        report
      );
    }
  }

  if (mutedRole) {
    for (const channel of guild.channels.cache.values()) {
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        continue;
      }

      if (isModerationChannel(channel)) {
        addReportItem(
          report,
          'unchanged',
          `Muted overwrite skipped in moderation channel #${channel.name}`
        );
        continue;
      }

      await ensureOverwrite(
        channel,
        mutedRole,
        {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          SendMessagesInThreads: false,
        },
        'Muted deny send',
        applyChanges,
        report
      );
    }
  } else {
    addReportItem(report, 'warnings', 'Muted role not found; muted channel policy not applied.');
  }

  for (const template of TEMPLATE_MESSAGES) {
    const channel = channelsByName.get(template.channelName.toLowerCase());
    if (!channel) {
      addReportItem(
        report,
        'warnings',
        `Template skipped because channel #${template.channelName} is missing.`
      );
      continue;
    }

    await ensurePinnedTemplate(channel, template, applyChanges, report);
  }

  return {
    ...report,
    summary: truncateText(
      `created=${report.created.length}, updated=${report.updated.length}, unchanged=${report.unchanged.length}, warnings=${report.warnings.length}`,
      300
    ),
  };
}

module.exports = {
  bootstrapDevServer,
  createBootstrapReport,
};
