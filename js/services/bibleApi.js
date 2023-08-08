const axios = require('axios');
const { logger } = require('../logger.js');
const { bibleApiUrl } = require('../../cfg/config.json');

// Function to fetch a random Bible verse
async function getRandomBibleVerse(passage) {
  try {
    logger.debug('Fetching random Bible verse from API: ' + bibleApiUrl);
    
    const response = await axios.get(bibleApiUrl + passage);
    const randomVerse = response.data[0];
    logger.info('Random Bible verse fetched successfully.  Response Code: ' + response.status);

    return randomVerse;
  } catch (error) {
    logger.error('Error fetching Bible verse:', error);
    return null;
  }
}

module.exports = {
  getRandomBibleVerse
};
