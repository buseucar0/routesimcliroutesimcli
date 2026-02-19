'use strict';

const dgram = require('dgram');

/**
 * Build a 72-byte V2X packet buffer from vehicle state.
 *
 * Layout (all little-endian):
 *   0-7   : latitude   (float64)
 *   8-15  : longitude  (float64)
 *  16-23  : speed      (float64) km/h
 *  24-31  : heading    (float64) degrees
 *  32-39  : timestamp  (float64) epoch ms
 *  40-41  : flags      (uint16)  bitfield: eebl|lightBar|siren|flasher|foglight|drl
 *  42     : wiper      (uint8)
 *  43     : leftSignal (uint8)   0|1
 *  44     : rightSignal(uint8)   0|1
 *  45-71  : reserved / zero-padded to 72 bytes
 */
function buildPacket(state) {
  const buf = Buffer.alloc(72);
  buf.writeDoubleLE(state.lat, 0);
  buf.writeDoubleLE(state.lng, 8);
  buf.writeDoubleLE(state.speed || 0, 16);
  buf.writeDoubleLE(state.heading || 0, 24);
  buf.writeDoubleLE(Date.now(), 32);

  const v2x = state.v2x || {};
  let flags = 0;
  if (v2x.eebl) flags |= 1;
  if (v2x.lightBar) flags |= 2;
  if (v2x.siren) flags |= 4;
  if (v2x.flasher) flags |= 8;
  if (v2x.foglight) flags |= 16;
  if (v2x.drl) flags |= 32;
  buf.writeUInt16LE(flags, 40);
  buf.writeUInt8(v2x.wiper || 0, 42);
  buf.writeUInt8(v2x.leftSignal ? 1 : 0, 43);
  buf.writeUInt8(v2x.rightSignal ? 1 : 0, 44);

  return buf;
}

class UdpSender {
  constructor() {
    this.socket = dgram.createSocket('udp4');
  }

  /**
   * Send a V2X packet to the given ip:port.
   */
  send(state, ip, port) {
    const packet = buildPacket(state);
    return new Promise((resolve, reject) => {
      this.socket.send(packet, 0, packet.length, port, ip, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.socket.close(resolve);
    });
  }
}

module.exports = { UdpSender, buildPacket };
