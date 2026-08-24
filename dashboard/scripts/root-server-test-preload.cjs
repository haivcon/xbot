'use strict';

const Module = require('node:module');
const { EventEmitter } = require('node:events');
const originalLoad = Module._load;

class FakeTelegramBot extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    return new Proxy(this, {
      get(target, property) {
        if (property in target) {
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return () => Promise.resolve(true);
      },
    });
  }

  processUpdate() { return Promise.resolve(); }
  startPolling() { return Promise.resolve(); }
  stopPolling() { return Promise.resolve(); }
  setWebHook() { return Promise.resolve(true); }
  setMyCommands() { return Promise.resolve(true); }
  deleteMyCommands() { return Promise.resolve(true); }
  answerCallbackQuery() { return Promise.resolve(true); }
  sendMessage() { return Promise.resolve({ message_id: 1 }); }
  deleteMessage() { return Promise.resolve(true); }
}

Module._load = function load(request, parent, isMain) {
  if (request === 'node-telegram-bot-api') return FakeTelegramBot;
  return originalLoad.call(this, request, parent, isMain);
};
