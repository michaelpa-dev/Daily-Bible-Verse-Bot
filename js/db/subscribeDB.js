//crud js file for subscribed_users.json in the /db folder
const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.js');
const subscribedUsersFile = path.join(__dirname, '../../db/subscribed_users.json');

// Function to get all subscribed users
async function getSubscribedUsers() {
    try {
        logger.debug('Fetching subscribed users from file: ' + subscribedUsersFile);
        const subscribedUsers = JSON.parse(fs.readFileSync(subscribedUsersFile)).map(item => ({ id: item.id }));
        logger.debug('Subscribed users fetched successfully. Count: ' + subscribedUsers.length + '.');
        return subscribedUsers;
    } catch (error) {
        logger.error('Error fetching subscribed users:', error);
        return [];
    }
}

// Function to add a subscribed user
async function addSubscribedUser(userId) {
    try {
        logger.debug('Adding subscribed user to file: ' + subscribedUsersFile);
        const subscribedUsers = await getSubscribedUsers();
        subscribedUsers.push({ id: userId });
        fs.writeFileSync(subscribedUsersFile, JSON.stringify(subscribedUsers, null, 2));
        logger.info('Subscribed user added successfully.');
    } catch (error) {
        logger.error('Error adding subscribed user:', error);
    }
}

// Function to remove a subscribed user
async function removeSubscribedUser(userId) {
    try {
        logger.debug('Removing subscribed user from file: ' + subscribedUsersFile);
        const subscribedUsers = await getSubscribedUsers();
        const filteredSubscribedUsers = subscribedUsers.filter((user) => user.id !== userId);
        fs.writeFileSync(subscribedUsersFile, JSON.stringify(filteredSubscribedUsers, null, 2));
        logger.info('Subscribed user removed successfully.');
    } catch (error) {
        logger.error('Error removing subscribed user:', error);
    }
}

// Function to check if user is subscribed
async function isSubscribed(userId) {
    try {
        logger.debug('Checking if user is subscribed.');
        const subscribedUsers = await getSubscribedUsers();
        const subscribedUser = subscribedUsers.find((user) => user.id === userId);
        return subscribedUser !== undefined;
    } catch (error) {
        logger.error('Error checking if user is subscribed:', error);
        return false;
    }
}

// Function to remove all subscribed users
async function removeAllSubscribedUsers() {
    try {
        logger.debug('Removing all subscribed users.');
        fs.writeFileSync(subscribedUsersFile, JSON.stringify([], null, 2));
        logger.info('All subscribed users removed successfully.');
        updateSubscribedUsersCount();
    } catch (error) {
        logger.error('Error removing all subscribed users:', error);
    }
}

module.exports = {
    getSubscribedUsers, addSubscribedUser, removeSubscribedUser, isSubscribed, removeAllSubscribedUsers
};