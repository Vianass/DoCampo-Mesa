import { it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { ReviewsService } from '../../src/modules/reviews/reviews.service.js';
import type { AdminService } from '../../src/modules/admin/admin.service.js';
it('sem autenticação configurada, nenhum percurso privado de avaliações chama o serviço', async () => {
  const call = vi.fn(),
    reviews = {
      own: call,
      ownDetail: call,
      eligibility: call,
      create: call,
      adminList: call,
      adminDetail: call,
      moderate: call,
      history: call,
    } as unknown as ReviewsService;
  const app = createApp({ reviews, admin: {} as AdminService });
  for (const url of [
    '/api/me/reviews',
    '/api/me/review-eligibility',
    '/api/admin/reviews',
    '/api/admin/reviews/000000000000000000000901',
  ])
    await request(app).get(url).expect(401);
  await request(app).post('/api/reviews').send({}).expect(401);
  await request(app)
    .patch('/api/admin/reviews/000000000000000000000901/moderation')
    .send({})
    .expect(401);
  expect(call).not.toHaveBeenCalled();
});
