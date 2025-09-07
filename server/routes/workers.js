const express = require('express');
const router = express.Router();
const workersController = require('../controllers/workers');

router.get('/', workersController.getAll);
router.post('/', workersController.create);
// ...עדכון, מחיקה וכו'

module.exports = router;
