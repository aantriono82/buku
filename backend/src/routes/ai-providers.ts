import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import { listAvailableTextProviders, type TextProviderCredentials } from '../services/ai-providers.js';

export function aiProviderRoutes(credentials: TextProviderCredentials): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (_req, res) => {
    res.json(listAvailableTextProviders(credentials));
  });

  return router;
}
