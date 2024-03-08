// Redis class implementation
import redis from 'redis';

class RedisClient {
  constructor() {
    this.client = redis.createClient();
	this.client.on('error', (error) => { console.log(error); });
  }

  isAlive() {
	  return this.client.connected;
  }

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

  async set(key, value, duration) {
		return new Promise((resolve, reject) => {
			this.client.set(key, value, 'EX',  duration, (error, reply) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(reply);
			});
		});
	}
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
const redisClient = new RedisClient()
module.exports = redisClient
