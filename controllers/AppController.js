const redisClient = require('../utils/redis');
const db = require('../utils/db');

const getStatus = (req, res) => {
  const redisStatus = !!redisClient.connected;
  const dbStatus = !!db.db.serverConfig.isConnected();

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
