import '@testing-library/dom';
import { configureGlobal } from 'fast-check';

// Configure fast-check global settings with 100 iterations as per requirements
configureGlobal({
  numRuns: 100,
  verbose: false,
});
