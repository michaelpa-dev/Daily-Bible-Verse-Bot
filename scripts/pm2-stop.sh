# This script stops the pm2 process for the Daily Bible Verse Bot

# Archive the log file and delete old log files
./archiveLog.sh

# Stop the pm2 process
pm2 stop "Daily Bible Verse Bot"
