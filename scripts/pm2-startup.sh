#!/bin/bash
# Start the bot using pm2
pm2 start ../js/bot.js --name "Daily Bible Verse Bot" --node-args="--max-old-space-size=512" 

# Save the current pm2 configuration
pm2 save

# Generate a startup script
pm2 startup

# Save the pm2 configuration again to update the startup script
pm2 save
