const redisClient = require('../redis-client');
const db = require('../db-client');

const getStatus = (req, res) => {
  const redisStatus = redisClient.connected ? true : false;
  const dbStatus = db.db.serverConfig.isConnected() ? true : false;

  const status = {
    redis: redisStatus,
    db: dbStatus,
  };

  res.status(200).json(status);
};

const getStats = async (req, res) => {
  try {
    const usersCount = await db.User.countDocuments();
    const filesCount = await db.File.countDocuments();

    const stats = {
      users: usersCount,
      files: filesCount,
    };

    res.status(200).json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getStatus,
  getStats,
};