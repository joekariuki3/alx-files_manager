import { ObjectID } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull';
import { findUserIdByToken } from '../utils/users';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import File from '../models/File';

class FilesController {
  /**
   * Should create a new file in DB and in disk
   */
  static async postUpload(request, response) {
    const fileQueue = new Queue('fileQueue');
    // Retrieve the user based on the token
    const userId = await findUserIdByToken(request);
    if (!userId) return response.status(401).json({ error: 'Unauthorized' });

    let fileInserted;

    // Validate the request data
    const { name } = request.body;
    if (!name) return response.status(400).json({ error: 'Missing name' });
    const { type } = request.body;
    if (!type || !['folder', 'file', 'image'].includes(type)) { return response.status(400).json({ error: 'Missing type' }); }

    const isPublic = request.body.isPublic || false;
    const parentId = request.body.parentId || 0;
    const { data } = request.body;
    if (!data && !['folder'].includes(type)) { return response.status(400).json({ error: 'Missing data' }); }
    // parentId (optional) as ID of the parent (default 0-> root)
    if (parentId !== 0) {
      const parentFileArray = await dbClient.files.find({ _id: ObjectID(parentId) }).toArray();
      if (parentFileArray.length === 0) return response.status(400).json({ error: 'Parent not found' });
      const file = parentFileArray[0];
      if (file.type !== 'folder') return response.status(400).json({ error: 'Parent is not a folder' });
    }

    // if no data, and not a folder, error
    if (!data && type !== 'folder') return response.status(400).json({ error: 'Missing Data' });

    // if type is folder then insert into DB, owner is ObjectID(userId)
    if (type === 'folder') {
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
      });
    // if not folder, store file in DB unscrambled
    } else {
      // Create a folder for this file
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true }, () => {});
      // the actual location is the root computer 'C:/tmp/files_manager

      // Create an ID and a new path to the new file
      const filenameUUID = uuidv4();
      const localPath = `${folderPath}/${filenameUUID}`;

      // Unscramble data and write to new path
      const clearData = Buffer.from(data, 'base64');
      await fs.promises.writeFile(localPath, clearData.toString(), { flag: 'w+' });
      await fs.readdirSync('/').forEach((file) => {
        console.log(file);
      });

      // Insert into the DB
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
        localPath,
      });

      // if the file is an image, save it in binary
      if (type === 'image') {
        await fs.promises.writeFile(localPath, clearData, { flag: 'w+', encoding: 'binary' });
        await fileQueue.add({ userId, fileId: fileInserted.insertedId, localPath });
      }
    }

    // Return the new file with a status code 201
    return response.status(201).json({
      id: fileInserted.ops[0]._id, userId, name, type, isPublic, parentId,
    });
  }

  // GET /files/:id
  // Return file by fileId
  static async getShow(request, response) {
    // Retrieve the user based on the token
    const token = request.headers['x-token'];
    if (!token) { return response.status(401).json({ error: 'Unauthorized' }); }
    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) { return response.status(401).json({ error: 'Unauthorized' }); }
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) { return response.status(401).json({ error: 'Unauthorized' }); }

    const idFile = request.params.id || '';
    const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(idFile), userId: user._id });
    if (!fileDocument) return response.status(404).send({ error: 'Not found' });

    return response.send({
      id: fileDocument._id,
      userId: fileDocument.userId,
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId: fileDocument.parentId,
    });
  }

  // GET /files
  // Return the files attached to the user
  static async getIndex(request, response) {
    // Retrieve the user based on the token
    const token = request.headers['x-token'];
    if (!token) { return response.status(401).json({ error: 'Unauthorized' }); }
    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) { return response.status(401).json({ error: 'Unauthorized' }); }
    const parentId = request.query.parentId || '0';
    const pagination = request.query.page || 0;
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) response.status(401).json({ error: 'Unauthorized' });

    const aggregationMatch = { $and: [{ parentId }] };
    let aggregateData = [
      { $match: aggregationMatch },
      { $skip: pagination * 20 },
      { $limit: 20 },
    ];
    if (parentId === 0) aggregateData = [{ $skip: pagination * 20 }, { $limit: 20 }];

    const files = await dbClient.db.collection('files').aggregate(aggregateData);
    const filesArray = [];
    await files.forEach((item) => {
      const fileItem = {
        id: item._id,
        userId: item.userId,
        name: item.name,
        type: item.type,
        isPublic: item.isPublic,
        parentId: item.parentId,
      };
      filesArray.push(fileItem);
    });
    return response.send(filesArray);
  }

  exports.putPublish = async (req, res) => {
    try {
      const token = req.header('Authorization').replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({ _id: decoded._id });
  
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
  
      const file = await File.findOne({ _id: req.params.id, user: user._id });
  
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }
  
      file.isPublic = true;
      await file.save();
  
      res.status(200).json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  };
  
  exports.putUnpublish = async (req, res) => {
    try {
      const token = req.header('Authorization').replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({ _id: decoded._id });
  
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
  
      const file = await File.findOne({ _id: req.params.id, user: user._id });
  
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }
  
      file.isPublic = false;
      await file.save();
  
      res.status(200).json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  };

  exports.getFile = async (req, res) => {
    const { id } = req.params;
  
    // 1. Check file existence and access permission (including ownership)
    try {
      const filePath = path.join(__dirname, '../', 'files', id); // Adjust path based on your file storage location
      const fileStats = await fs.stat(filePath);
  
      if (!fileStats.isFile()) {
        return res.status(400).json({ error: 'A folder doesn\'t have content' });
      }
  
      // Implement your logic to check if the user has access to the file (replace with actual authorization)
      if (!hasAccess(req.user, id)) {
        return res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  
    // 2. Read file content and determine MIME type
    const fileContent = await fs.readFile(filePath);
    const mimeType = mime.lookup(filePath);
  
    // 3. Return file content with appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.send(fileContent);
  };
  
  // Replace this with your actual logic to check user access to the file based on ownership or other criteria
  function hasAccess(user, fileId) {
    // Implement your authentication and authorization logic here
    // This is a placeholder, replace with your actual access control mechanism
    return user.id === fileId; // Replace with appropriate check
  }
}
module.exports = FilesController;
