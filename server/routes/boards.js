const express = require('express');
const router = express.Router();
const boards = require('../controllers/boards');

router.get('/', boards.list);
router.post('/', boards.create);
router.patch('/:id', boards.update);
router.delete('/:id', boards.remove);

module.exports = router;
