const express = require('express');
const { internalAuthController } = require('../../controllers');

const router = express.Router();

router.get('/jwks', internalAuthController.getJwks);

module.exports = router;
