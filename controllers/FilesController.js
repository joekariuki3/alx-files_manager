import { ObjectID } from 'mongodb';
import fs, { readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull';
import mime from 'mime-types';
import { findUserIdByToken } from '../utils/users';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  /**
   * Should create a new file in DB and in disk
   */
  static async postUpload(request, response) {
    const fileQueue = new Queue('fileQueue');
    // Retrieve the user based on the token
    const userId = await findUserIdByToken(request);
    if (!userId) return response.status(401).json({ error: 'Unauthorized' });


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

    let fileInserted;
    
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

    const size = parseInt(request.query.size) || 0;
    const filePath = path.join(process.env.FOLDER_PATH, fileDocument.localPath);
    const thumbnailPath = size > 0 ? `${filePath}_${size}` : filePath;

    if (!fs.existsSync(thumbnailPath)) {
       return response.status(404).send({ error: 'Not found' });
    }

    const fileData = fs.readFileSync(thumbnailPath);
    const mimeType = mime.lookup(filePath);

    res.setHeader('Content-Type', mimeType);
    res.send(fileData);

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
  
  static async putPublish(request, response) {
    const userId = await findUserIdByToken(request);
    // const { userId } = await getIdAndKey(request);
    // if (!isValidUser(userId)) return response.status(401).send({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({ _id: ObjectID(userId) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    const fileId = request.params.id || '';

    let file = await dbClient.files.findOne({ _id: ObjectID(fileId), userId: user._id });
    if (!file) return response.status(404).send({ error: 'Not found' });

    await dbClient.files.updateOne({ _id: ObjectID(fileId) }, { $set: { isPublic: true } });
    file = await dbClient.files.findOne({ _id: ObjectID(fileId), userId: user._id });

    return response.status(200).send({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async putUnpublish(request, response) {
    const userId = await findUserIdByToken(request);
    // const { userId } = await getIdAndKey(request);
    // if (!isValidUser(userId)) return response.status(401).send({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({ _id: ObjectID(userId) });
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    const fileId = request.params.id || '';

    let file = await dbClient.files.findOne({ _id: ObjectID(fileId), userId: user._id });
    if (!file) return response.status(404).send({ error: 'Not found' });

    await dbClient.files.updateOne({ _id: ObjectID(fileId) }, { $set: { isPublic: false } });
    file = await dbClient.files.findOne({ _id: ObjectID(fileId), userId: user._id });

    return response.status(200).send({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getFile(request, response) {
    const fileId = request.params.id || '';
    const size = request.query.size || 0;

    const file = await dbClient.files.findOne({ _id: ObjectID(fileId) });
    if (!file) return response.status(404).send({ error: 'Not found' });

    const { isPublic, userId, type } = file;

    // const { userId: user } = await getIdAndKey(request);
    const user = await dbClient.users.findOne({ _id: ObjectID(userId) });

    if ((!isPublic && !user) || (user && userId.toString() !== user && !isPublic)) return response.status(404).send({ error: 'Not found' });
    if (type === 'folder') return response.status(400).send({ error: 'A folder doesn\'t have content' });

    const path = size === 0 ? file.localPath : `${file.localPath}_${size}`;

    try {
      const fileData = readFileSync(path);
      const mimeType = mime.contentType(file.name);
      response.setHeader('Content-Type', mimeType);
      return response.status(200).send(fileData);
    } catch (err) {
      return response.status(404).send({ error: 'Not found' });
    }
  }
}
module.exports = FilesController;
