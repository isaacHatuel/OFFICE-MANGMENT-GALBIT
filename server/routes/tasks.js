const express = require('express');
const router = express.Router();
const tasks = require('../controllers/tasks');

router.get('/', tasks.list);
router.post('/', tasks.create);
router.patch('/:id', tasks.update);
router.delete('/:id', tasks.remove);

module.exports = router;