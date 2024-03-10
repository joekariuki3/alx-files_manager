// Redis class implementation
import redis from 'redis';

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (error) => {
      console.log(error);
    });
  }

  // check if client is connected to redis
  isAlive() {
    return this.client.connected;
  }

  // retrieves value of key passed from redis
  async get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (error, reply) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(reply);
      });
    });
  }

  // sets a expiry duration of a value set for key
  async set(key, value, duration) {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, 'EX', duration, (error, reply) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(reply);
      });
    });
  }

  // Removes value of the key passed to it
  async del(key) {
    return new Promise((resolve, reject) => {
      this.client.del(key, (error, reply) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(reply);
      });
    });
  }
}

// instance of RedisClient
const redisClient = new RedisClient();
// export the created instance
export default redisClient;
