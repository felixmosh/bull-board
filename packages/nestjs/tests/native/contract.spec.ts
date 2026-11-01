import { runServerAdapterContract } from '@bull-board/test-utils';
import { createNativeHarness } from './harness';

runServerAdapterContract('Nest native', createNativeHarness);
