/**
 * AgntUX API Routes
 *
 * API endpoints for AgntUX visual testing mode.
 */

import { Hono } from 'hono';
import { testHandler, healthHandler } from './handlers.js';

const agntuxRoutes = new Hono();

// Health check
agntuxRoutes.get('/health', healthHandler);

// Visual test execution endpoint
agntuxRoutes.post('/test', testHandler);

export default agntuxRoutes;
