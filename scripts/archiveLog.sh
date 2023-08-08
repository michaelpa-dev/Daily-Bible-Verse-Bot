#!/bin/bash

# This script is run when the bot is stopped using pm2
# It archives the log file and deletes old log files

# Create or append to the applicationExit.log file
echo "Script started at $(date)" >> "../logs/applicationExit.log"

logPath="../logs/bot.log"
logPathArchive="../logs/archive/bot_$(date +%s%3N).log"
mv "$logPath" "$logPathArchive"

echo "Log file archived to: $logPathArchive" >> "../logs/applicationExit.log"

# Delete old log files
archiveDirectory="../logs/archive"

# Get a list of all log files in the archive directory
archiveFiles=($archiveDirectory/bot_*.log)

# Sort the log files by their modification time (oldest first)
IFS=$'\n' sortedFiles=($(sort -n <<<"${archiveFiles[*]}"))
unset IFS

# Calculate the number of log files to keep (5 most recent)
filesToKeep=5

# Delete old log files (keep the 5 most recent)
for ((i = 0; i < ${#sortedFiles[@]} - $filesToKeep; i++)); do
    fileToDelete="${sortedFiles[$i]}"
    rm "$fileToDelete"
    echo "Deleted old log file: $fileToDelete" >> "../logs/applicationExit.log"
done

if [ ${#sortedFiles[@]} -gt $filesToKeep ]; then
    echo "Old log files deleted, keeping the $filesToKeep most recent ones" >> "../logs/applicationExit.log"
fi

echo "Script finished at $(date)" >> "../logs/applicationExit.log"

# Move applicationExit.log to the archive directory
mv "../logs/applicationExit.log" "$archiveDirectory/applicationExit_$(date +%s%3N).log"

# Delete old applicationExit files
applicationExitFiles=($archiveDirectory/applicationExit_*.log)

# Sort the applicationExit files by their modification time (oldest first)
IFS=$'\n' sortedapplicationExitFiles=($(sort -n <<<"${applicationExitFiles[*]}"))
unset IFS

# Delete old applicationExit files (keep the 5 most recent)
for ((i = 0; i < ${#sortedapplicationExitFiles[@]} - $filesToKeep; i++)); do
    fileToDelete="${sortedapplicationExitFiles[$i]}"
    rm "$fileToDelete"
    echo "Deleted old applicationExit file: $fileToDelete" >> "../logs/applicationExit.log"
done

