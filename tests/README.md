# Dummy-data checks

These scripts use only generated local signals. They do not connect to the Ethernet bridge or send data anywhere.

From the repository root, run one check:

```sh
node tests/test-signal-processing.mjs
node tests/test-spectrum.mjs
node tests/test-scope-frames.mjs
```

Run all three with:

```sh
cd frontend
npm run test:dummy
```

The scope-frame check covers single and paired inputs in Time, X-Y, and FFT modes, plus single acquisition and FFT axis scaling. The spectrum check synthesizes a 50 Hz sine with a 10% third harmonic.
