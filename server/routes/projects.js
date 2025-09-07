const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projects');

router.get('/', projectsController.getAll);
router.post('/', projectsController.create);
router.patch('/:id', projectsController.update);
router.delete('/:id', projectsController.remove);

module.exports = router;
