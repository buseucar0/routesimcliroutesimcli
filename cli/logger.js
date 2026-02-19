'use strict';

const fs = require('fs');
const path = require('path');

class Logger {
  /**
   * @param {string} filePath  — output file path
   * @param {'csv'|'json'} format
   */
  constructor(filePath, format) {
    this.format = format;
    this.filePath = path.resolve(filePath);
    this.stream = fs.createWriteStream(this.filePath, { flags: 'w' });

    if (format === 'csv') {
      this.stream.write(
        'timestamp,vehicleId,lat,lng,speed,heading,eebl,lightBar,siren,flasher,foglight,drl,wiper,leftSignal,rightSignal\n'
      );
    }
  }

  /**
   * Log a single simulation tick.
   */
  log(record) {
    if (this.format === 'csv') {
      const line = [
        record.timestamp,
        record.vehicleId,
        record.lat,
        record.lng,
        record.speed,
        record.heading,
        record.eebl ? 1 : 0,
        record.lightBar ? 1 : 0,
        record.siren ? 1 : 0,
        record.flasher ? 1 : 0,
        record.foglight ? 1 : 0,
        record.drl ? 1 : 0,
        record.wiper,
        record.leftSignal ? 1 : 0,
        record.rightSignal ? 1 : 0,
      ].join(',');
      this.stream.write(line + '\n');
    } else {
      this.stream.write(JSON.stringify(record) + '\n');
    }
  }

  close() {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}

module.exports = { Logger };
