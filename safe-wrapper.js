'use strict';
require('dotenv').config();
process.env.EXECUTION_DISABLED = 'true';
process.env.PRICE_ALERT_SCHEDULER_ENABLED = 'true';
process.env.JOB_QUEUE_CONCURRENCY = '1';
require('./index.js');
