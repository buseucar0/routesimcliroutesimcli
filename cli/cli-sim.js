#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');
const { runSimulation } = require('./simulationRunner');

// ── Argument parsing ────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    scenario: null,
    freq: 10,
    repeat: 1,
    output: null,
    format: 'csv',
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--scenario':
        opts.scenario = args[++i];
        break;
      case '--freq':
        opts.freq = parseInt(args[++i], 10);
        break;
      case '--repeat':
        opts.repeat = parseInt(args[++i], 10);
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--format':
        opts.format = args[++i];
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!opts.scenario) {
    console.error('Error: --scenario is required.');
    printUsage();
    process.exit(1);
  }

  if (!opts.output) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = opts.format === 'json' ? 'jsonl' : 'csv';
    opts.output = `sim-output-${ts}.${ext}`;
  }

  return opts;
}

function printUsage() {
  console.log(`
Usage: node cli/cli-sim.js --scenario <file> [options]

Options:
  --scenario <file>   Routesim export JSON file (required)
  --freq <hz>         Transmission frequency, default 10
  --repeat <n>        Repeat simulation n times, default 1
  --output <file>     Output log file path
  --format csv|json   Output format, default csv
  --verbose           Print detailed logs to terminal
  --help              Show this help
`);
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  // Load scenario
  const scenarioPath = path.resolve(opts.scenario);
  if (!fs.existsSync(scenarioPath)) {
    console.error(`Scenario file not found: ${scenarioPath}`);
    process.exit(1);
  }

  let scenario;
  try {
    scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to parse scenario JSON: ${e.message}`);
    process.exit(1);
  }

  if (opts.verbose) {
    console.log(`Scenario: ${scenarioPath}`);
    console.log(`Vehicles: ${(scenario.vehicles || []).length}`);
    console.log(`RSUs:     ${(scenario.rsus || []).length}`);
    console.log(`Freq:     ${opts.freq} Hz`);
    console.log(`Repeat:   ${opts.repeat}`);
    console.log(`Output:   ${opts.output} (${opts.format})`);
  }

  const logger = new Logger(opts.output, opts.format);

  const start = Date.now();
  await runSimulation(scenario, {
    freq: opts.freq,
    repeat: opts.repeat,
    logger,
    verbose: opts.verbose,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  await logger.close();
  console.log(`Simulation complete in ${elapsed}s — output: ${opts.output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
