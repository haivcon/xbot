const os = require('os');
const crypto = require('crypto');

let BullMQ = null;
let IORedis = null;

try {
    // Optional; falls back to in-memory queue if not installed
    // eslint-disable-next-line global-require
    BullMQ = require('bullmq');
    // eslint-disable-next-line global-require
    IORedis = require('ioredis');
} catch (error) {
    BullMQ = null;
    IORedis = null;
}

const REDIS_URL = process.env.JOB_QUEUE_REDIS_URL || process.env.REDIS_URL || null;
const QUEUE_NAME = process.env.JOB_QUEUE_NAME || 'bot-jobs';
const QUEUE_CONCURRENCY = Number(process.env.JOB_QUEUE_CONCURRENCY || Math.max(2, os.cpus().length || 2));
const DEFAULT_ATTEMPTS = Number(process.env.JOB_QUEUE_ATTEMPTS || 3);
const DEFAULT_BACKOFF_MS = Number(process.env.JOB_QUEUE_BACKOFF_MS || 500);

const usingRedisQueue = Boolean(REDIS_URL && BullMQ && IORedis);
const handlers = new Map();

const inMemoryQueue = [];
let drainingMemory = false;
let started = false;
let queue = null;
let worker = null;
let scheduler = null;
let queueEvents = null;
let queueSchedulerSupported = false;
let queueEventsSupported = false;

if (BullMQ) {
    queueSchedulerSupported = typeof BullMQ.QueueScheduler === 'function';
    queueEventsSupported = typeof BullMQ.QueueEvents === 'function';
}

const maskRedisUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return null;
    }
    try {
        const parsed = new URL(url);
        const host = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
        return `${parsed.protocol}//${host}${parsed.pathname || ''}`;
    } catch (_) {
        return 'redis://<hidden>';
    }
};

const randomId = () => {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isRedisBacked = () => usingRedisQueue;
const hasHandlers = () => handlers.size > 0;

function registerJobHandler(name, handler) {
    if (!name || typeof name !== 'string') {
        throw new Error('Job name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
        throw new Error('Job handler must be a function');
    }
    handlers.set(name, handler);
}

async function runHandler(name, data) {
    const handler = handlers.get(name);
    if (!handler) {
        throw new Error(`No handler registered for job: ${name}`);
    }
    return handler(data);
}

async function drainMemoryQueue() {
    if (drainingMemory) {
        return;
    }
    drainingMemory = true;

    while (inMemoryQueue.length) {
        const job = inMemoryQueue.shift();
        try {
            await runHandler(job.name, job.data);
        } catch (error) {
            console.error(`[Queue][memory] Job ${job.name} failed:`, error.message || error);
        }
    }

    drainingMemory = false;
}

function startJobWorkers() {
    if (started) {
        return;
    }
    started = true;

    if (usingRedisQueue) {
        const redisOptions = { maxRetriesPerRequest: null };
        let connection;

        try {
            connection = new IORedis(REDIS_URL, redisOptions);
        } catch (error) {
            console.error('[Queue][redis] Failed to create Redis connection:', error?.message || error);
            return;
        }

        try {
            queue = new BullMQ.Queue(QUEUE_NAME, { connection });
        } catch (error) {
            console.error('[Queue][redis] Failed to create Queue:', error?.message || error);
            return;
        }

        if (queueSchedulerSupported) {
            try {
                scheduler = new BullMQ.QueueScheduler(QUEUE_NAME, { connection });
            } catch (error) {
                console.warn('[Queue][redis] QueueScheduler init failed:', error?.message || error);
            }
        } else {
            console.warn('[Queue][redis] QueueScheduler not available (bullmq v5+). Skipping.');
        }

        if (queueEventsSupported) {
            try {
                queueEvents = new BullMQ.QueueEvents(QUEUE_NAME, { connection });
            } catch (error) {
                console.warn('[Queue][redis] QueueEvents init failed:', error?.message || error);
                queueEvents = null;
            }
        }

        try {
            worker = new BullMQ.Worker(
                QUEUE_NAME,
                async (job) => runHandler(job.name, job.data),
                {
                    concurrency: QUEUE_CONCURRENCY,
                    connection
                }
            );
        } catch (error) {
            console.error('[Queue][redis] Failed to start Worker:', error?.message || error);
            return;
        }

        worker.on('error', (error) => {
            console.error('[Queue][redis] Worker error:', error?.message || error);
        });

        worker.on('failed', (job, error) => {
            console.error(
                `[Queue][redis] Job ${job?.name || job?.id} failed:`,
                error?.message || error
            );
        });

        if (queueEvents) {
            queueEvents.on('failed', ({ jobId, failedReason, name }) => {
                console.error(`[Queue][redis] Job ${name || jobId} failed:`, failedReason);
            });
        }

        console.info(
            `[Queue][redis] Started queue "${QUEUE_NAME}" with concurrency=${QUEUE_CONCURRENCY}`
        );
    } else {
        console.warn('[Queue] Using in-memory queue (no Redis/bullmq). Jobs will not persist.');
    }
}

async function enqueueJob(name, data = {}, options = {}) {
    if (!handlers.has(name)) {
        throw new Error(`No handler registered for job: ${name}`);
    }

    if (!started) {
        startJobWorkers();
    }

    if (usingRedisQueue && queue) {
        const job = await queue.add(name, data, {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: options.attempts || DEFAULT_ATTEMPTS,
            backoff: {
                type: 'exponential',
                delay: options.backoffMs || DEFAULT_BACKOFF_MS
            }
        });
        return { id: job.id, mode: 'redis' };
    }

    const job = { id: randomId(), name, data };
    inMemoryQueue.push(job);
    setImmediate(drainMemoryQueue);
    return { id: job.id, mode: 'memory' };
}

function queueInfo() {
    return {
        mode: usingRedisQueue ? 'redis-bullmq' : 'memory',
        queueName: QUEUE_NAME,
        redis: usingRedisQueue ? maskRedisUrl(REDIS_URL) : null,
        handlers: Array.from(handlers.keys()),
        started
    };
}

module.exports = {
    enqueueJob,
    registerJobHandler,
    startJobWorkers,
    queueInfo,
    isRedisBacked,
    hasHandlers
};
