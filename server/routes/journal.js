const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journal');

router.get('/', journalController.getAll);
router.post('/', journalController.create);
router.patch('/:id', journalController.update);
router.delete('/:id', journalController.remove);

module.exports = router;
