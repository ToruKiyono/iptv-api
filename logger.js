const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const DEFAULT_LEVEL = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toLowerCase() : 'info';

class SimpleLogger {
  constructor(level, bindings = {}) {
    this.level = LEVELS.includes(level) ? level : DEFAULT_LEVEL;
    this.bindings = bindings;
    this.threshold = LEVELS.indexOf(this.level);
  }

  child(extraBindings = {}) {
    return new SimpleLogger(this.level, { ...this.bindings, ...extraBindings });
  }

  setLevel(level) {
    if (LEVELS.includes(level)) {
      this.level = level;
      this.threshold = LEVELS.indexOf(level);
    }
  }

  trace(meta, message) {
    this._write('trace', meta, message);
  }

  debug(meta, message) {
    this._write('debug', meta, message);
  }

  info(meta, message) {
    this._write('info', meta, message);
  }

  warn(meta, message) {
    this._write('warn', meta, message);
  }

  error(meta, message) {
    this._write('error', meta, message);
  }

  fatal(meta, message) {
    this._write('fatal', meta, message);
  }

  _write(level, meta = {}, message = '') {
    if (LEVELS.indexOf(level) < this.threshold) {
      return;
    }

    const normalizedMeta = {};
    Object.entries(meta || {}).forEach(([key, value]) => {
      if (value instanceof Error) {
        normalizedMeta[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      } else {
        normalizedMeta[key] = value;
      }
    });

    const normalizedBindings = {};
    Object.entries(this.bindings || {}).forEach(([key, value]) => {
      if (value instanceof Error) {
        normalizedBindings[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      } else {
        normalizedBindings[key] = value;
      }
    });

    const payload = {
      time: new Date().toISOString(),
      level,
      msg: message,
      ...normalizedBindings,
      ...normalizedMeta
    };

    const output = JSON.stringify(payload);

    if (level === 'error' || level === 'fatal') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

const baseLogger = new SimpleLogger(DEFAULT_LEVEL, { service: 'iptv-aggregator' });

function createLogger(bindings = {}) {
  return baseLogger.child(bindings);
}

module.exports = {
  logger: baseLogger,
  createLogger,
  LEVELS
};
