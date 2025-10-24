const { MongoClient } = require("mongodb");

// get data from environment variable if they are set
const host = process.env.DB_HOST || "localhost";
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || "files_manager";
const url = `mongodb://${host}:${port}/`;

class DBClient {
  constructor() {
    this.db = null;
    // make the connection to the db when instance of client is created
    MongoClient.connect(url, { useUnifiedTopology: true }, (error, client) => {
      // handle error during connection
      if (error) {
        console.log(error);
      }
      // connect to our db
      this.db = client.db(database);
      // create users and files collections
      this.users = this.db.collection("users");
      this.files = this.db.collection("files");
    });
  }

  isAlive() {
    // use !! to trnsform return value to boolean(true/false)
    return !!this.db;
  }

  async nbUsers() {
    try {
      const collection = this.users;
      const count = await collection.countDocuments();
      return count;
    } catch (error) {
      console.error("Error counting users:", error);
      return 0;
    }
  }

  async nbFiles() {
    try {
      const collection = this.files;
      const count = await collection.countDocuments();
      return count;
    } catch (error) {
      console.error("Error counting files:", error);
      return 0;
    }
  }

  // get all files
  async getFiles() {
    const files = await this.db.collection("files").find().toArray();
    return files;
  }

  async getUser(query) {
    const user = await this.db.collection("users").findOne(query);
    return user;
  }

  // get all users
  async getUsers() {
    const users = await this.db.collection("users").find().toArray();
    return users;
  }
}

const dbClient = new DBClient();
module.exports = dbClient;
