'use strict';
require('dotenv').config();
process.env.EXECUTION_DISABLED = 'true';
process.env.JOB_QUEUE_CONCURRENCY = '1';
require('./index.js');
