const { Router } = require('express');
const { getHealth } = require('./health.controller');

const router = Router();

router.get('/healthz', getHealth);

module.exports = router;
