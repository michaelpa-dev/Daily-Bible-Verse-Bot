const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.js');
const { getSubscribedUsers } = require('./subscribeDB.js');


const statsFilePath = path.join(__dirname, '../../db/stats.json');

async function updateSubscribedUsersCount(){
    try{
        const stats = JSON.parse(fs.readFileSync(statsFilePath));
        const subscribedUsers = await getSubscribedUsers();
        stats.subscribedUsersCount = subscribedUsers.length;
        fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
        logger.debug(`Subscribed users updated successfully. Count: ${stats.subscribedUsersCount}.`);
    } catch (error) {
        logger.error('Error updating subscribed users:', error);
    }
}

function addVerseSent(){
    try{
        const stats = JSON.parse(fs.readFileSync(statsFilePath));
        stats.totalVersesSent++;
        fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
        logger.debug(`Total verses sent updated successfully. Count: ${stats.totalVersesSent}.`);
    } catch (error) {
        logger.error('Error updating total verses sent:', error);
    }
}

function addCommandExecution(){
    try{
        const stats = JSON.parse(fs.readFileSync(statsFilePath));
        stats.totalCommandsExecuted++;
        fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
        logger.debug(`Total commands executed updated successfully. Count: ${stats.totalCommandsExecuted}.`);
    } catch (error) {
        logger.error('Error updating total commands executed:', error);
    }
}

function updateActiveGuilds(client){
    try{
        const stats = JSON.parse(fs.readFileSync(statsFilePath));
        stats.activeGuilds = client.guilds.cache.size;
        fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
        logger.debug(`Active guilds updated successfully. Count: ${stats.activeGuilds}.`);
    } catch (error) {
        logger.error('Error updating active guilds:', error);
    }
}

function getStats(){
    try{
        const stats = JSON.parse(fs.readFileSync(statsFilePath));
        return stats;
    } catch (error) {
        logger.error('Error getting stats:', error);
        return {};
    }
}

module.exports = {
    updateSubscribedUsersCount,
    addVerseSent,
    addCommandExecution,
    updateActiveGuilds,
    getStats
}

