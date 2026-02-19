'use strict';

const { haversineDistance, getBearing } = require('./geoUtils');
const { UdpSender } = require('./udpSender');

/**
 * Resolve path for a vehicle.
 * If `vehicle.path` has < 2 points, look for a matching entry in savedPaths.
 */
function resolvePath(vehicle, savedPaths) {
  if (Array.isArray(vehicle.path) && vehicle.path.length >= 2) {
    return vehicle.path;
  }
  if (Array.isArray(savedPaths)) {
    const match = savedPaths.find(
      (sp) => sp.vehicle_id === vehicle.id || sp.vehicleId === vehicle.id
    );
    if (match && Array.isArray(match.path) && match.path.length >= 2) {
      return match.path;
    }
  }
  return null;
}

/**
 * Interpolate between two waypoints one tick at a time.
 * Yields { lat, lng, speed, heading, v2x } for each tick.
 */
function* interpolateSegment(from, to, freq) {
  const hops = to.hops || 1;
  const segFreq = to.freq || freq;
  const totalTicks = hops;

  const latStep = (to.lat - from.lat) / totalTicks;
  const lngStep = (to.lng - from.lng) / totalTicks;

  const bearing = getBearing(from.lat, from.lng, to.lat, to.lng);
  const v2x = to.v2x || {};
  const speed = v2x.velocityKmh || 0;

  for (let t = 1; t <= totalTicks; t++) {
    yield {
      lat: from.lat + latStep * t,
      lng: from.lng + lngStep * t,
      speed,
      heading: bearing,
      v2x,
      interval: 1000 / segFreq,
    };
  }
}

/**
 * Run simulation for a single vehicle.
 */
async function runVehicle(vehicle, savedPaths, freq, logger, verbose) {
  const vPath = resolvePath(vehicle, savedPaths);
  if (!vPath) {
    if (verbose) console.log(`[SKIP] ${vehicle.id}: no valid path`);
    return;
  }

  const sender = new UdpSender();
  const ip = vehicle.ip || '127.0.0.1';
  const port = vehicle.port || 2021;

  if (verbose) console.log(`[START] ${vehicle.id} -> ${ip}:${port}  (${vPath.length} waypoints)`);

  for (let seg = 0; seg < vPath.length - 1; seg++) {
    const from = vPath[seg];
    const to = vPath[seg + 1];

    // Wait time before this segment (seconds)
    const waitTime = (from.waitTime || 0) * 1000;
    if (waitTime > 0) {
      if (verbose) console.log(`  [WAIT] ${vehicle.id} waiting ${from.waitTime}s`);
      await sleep(waitTime);
    }

    for (const tick of interpolateSegment(from, to, freq)) {
      const state = {
        lat: tick.lat,
        lng: tick.lng,
        speed: tick.speed,
        heading: tick.heading,
        v2x: tick.v2x,
      };

      try {
        await sender.send(state, ip, port);
      } catch (_) {
        // UDP send failures are non-fatal in simulation mode
      }

      const record = {
        timestamp: new Date().toISOString(),
        vehicleId: vehicle.id,
        lat: tick.lat,
        lng: tick.lng,
        speed: tick.speed,
        heading: tick.heading,
        eebl: tick.v2x.eebl || false,
        lightBar: tick.v2x.lightBar || false,
        siren: tick.v2x.siren || false,
        flasher: tick.v2x.flasher || false,
        foglight: tick.v2x.foglight || false,
        drl: tick.v2x.drl || false,
        wiper: tick.v2x.wiper || 0,
        leftSignal: tick.v2x.leftSignal || false,
        rightSignal: tick.v2x.rightSignal || false,
      };

      logger.log(record);

      if (verbose) {
        console.log(
          `  [TICK] ${vehicle.id}  lat=${tick.lat.toFixed(6)} lng=${tick.lng.toFixed(6)}  spd=${tick.speed} hdg=${tick.heading.toFixed(1)}`
        );
      }

      await sleep(tick.interval);
    }
  }

  await sender.close();
  if (verbose) console.log(`[DONE] ${vehicle.id}`);
}

/**
 * Run the full simulation for all vehicles.
 */
async function runSimulation(scenario, options) {
  const { freq, repeat, logger, verbose } = options;
  const vehicles = scenario.vehicles || [];
  const savedPaths = scenario.savedPaths || [];

  for (let r = 0; r < repeat; r++) {
    if (verbose) console.log(`\n=== Repeat ${r + 1}/${repeat} ===`);

    // Run all vehicles concurrently within each repeat
    await Promise.all(
      vehicles.map((v) => runVehicle(v, savedPaths, freq, logger, verbose))
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { runSimulation, resolvePath, interpolateSegment };
