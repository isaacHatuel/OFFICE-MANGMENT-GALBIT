const express = require('express');
const router = express.Router();
const timeEntries = require('../controllers/timeEntries');

router.get('/', timeEntries.list);
router.post('/', timeEntries.create);
router.patch('/:id', timeEntries.update);
router.delete('/:id', timeEntries.remove);

module.exports = router;