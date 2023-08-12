# Daily Bible Verse Bot

The Daily Bible Verse Bot is a Discord bot that provides users with daily Bible verses, random verses, and more. It allows users to subscribe and unsubscribe from receiving daily verses and provides various statistics about its usage and activity.

- [Daily Bible Verse Bot](#daily-bible-verse-bot)
  - [If you wish to invite the bot to your server but do not want to run the bot yourself](#if-you-wish-to-invite-the-bot-to-your-server-but-do-not-want-to-run-the-bot-yourself)
  - [Features](#features)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Usage](#usage)
  - [Available Commands](#available-commands)
  - [Directory Structure](#directory-structure)
  - [Credits](#credits)
  - [License](#license)


## If you wish to invite the bot to your server but do not want to run the bot yourself
- [Invite Link For Bot](https://discord.com/api/oauth2/authorize?client_id=1138224345446105108&permissions=380104993792&scope=applications.commands%20bot)
- Join our [Development Discord Server](https://discord.gg/VquUZs2msF) to engage with the community.

## Features

- Get a daily Bible verse sent to your DM.
- Receive a random Bible verse on demand.
- Subscribe and unsubscribe from daily Bible verses.
- View bot statistics, including subscribed users and command usage.
- Customizable status messages.
- Cross-server support.

## Installation

1. Clone this repository to your local machine.
2. Install the required dependencies using `npm install`.

## Configuration

1. Rename the `cfg/config.sample.json` file to `cfg/config.json`.
2. Replace the `botToken` value in `config.json` with your Discord bot token.

## Usage

1. Run the bot using `node ./js/bot.js` or the provided `/scripts/pm2-startup.sh` script.
2. Invite the bot to your Discord server using the provided invite link.
3. Use the available slash commands to interact with the bot.

## Available Commands

- `/subscribe`: Subscribe to receive daily Bible verses.
- `/unsubscribe`: Unsubscribe from receiving daily Bible verses.
- `/randomverse`: Get a random Bible verse via DM.
- `/stats`: View bot statistics, including subscribed users and command usage.
- `/support`: Get a link to the issue tracker for reporting issues and requesting support.
- `/version`: Get the bot current release version

## Directory Structure

daily-bible-verse-bot/

```
│
├── assets/
│ ├── bible_scripture_icon.png
│ └── statuses.txt
│
├── cfg/
│ └── config.json
│
├── db/
│ ├── subscribed_users.json
│ └── stats.json
│
├── js/
│ ├── commands/
│ │ ├── subscribe.js
│ │ ├── unsubscribe.js
│ │ ├── randomverse.js
│ │ ├── stats.js
│ │ └── support.js
│ │ └── version.js
│ ├── db/
│ │ ├── subscribeDB.js
│ │ └── statsDB.js
│ ├── services/
│ │ └── bibleApi.js
│ ├── bot.js
│ ├── logger.js
│ └── verseSender.js
│
├── logs/
│ ├── archive/
│ │ ├── applicationExit_<timestamp>.log
│ │ └── bot_<timestamp>.log
│ ├── applicationExit.log
│ └── bot.log
│
│ ├── archiveLog.sh
│ ├── pm2-startup.sh
│ └── pm2-stop.sh
│
├── package-lock.json
├── package.json
└── README.md
```

## Credits

- [Bible.org Labs](https://labs.bible.org/)
- [Discord.js](https://discord.js.org/)
- [Node.js](https://nodejs.org/)
- [Canvas](https://www.npmjs.com/package/canvas)
- [node-cron](https://www.npmjs.com/package/node-cron)

## License

This project is licensed under the [MIT License](LICENSE).
