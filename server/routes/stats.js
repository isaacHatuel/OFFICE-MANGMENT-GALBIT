const express = require('express');
const router = express.Router();
const stats = require('../controllers/stats');

router.get('/overview', stats.overview);
router.get('/time-range', stats.timeRange);
router.get('/top-clients', stats.topClients);
router.get('/status-distribution', stats.statusDistribution);
router.get('/workload', stats.workload);
router.get('/negative-trends', stats.negativeTrends);

module.exports = router;
