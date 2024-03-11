const express = require('express');

const router = express.Router();
const AppController = require('../controllers/AppController');
const UsersController = require('../controllers/UsersController');

router.get('/status', (req, res) => {
  AppController.getStatus(req, res);
});
router.get('/stats', (req, res) => {
  AppController.getStats(req, res);
});
router.post('/users', (req, res) => {
  UsersController.postNew(req, res);
});

module.exports = router;
