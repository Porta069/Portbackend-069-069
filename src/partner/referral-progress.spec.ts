import { PartnerService } from './partner.service';

/**
 * Fortschreibung des Referral-Status durch echte Ereignisse.
 *
 * Hier hängt Geld dran: Ein Referral, der einmal auf PLACED steht, darf durch
 * eine spätere Bewerbung nicht zurückfallen, und ein ausgezahlter darf gar
 * nicht mehr angefasst werden.
 */
describe('Referral-Fortschreibung', () => {
  const bauen = (referral: Record<string, unknown> | null) => {
    const updates: Record<string, unknown>[] = [];
    const prisma = {
      referral: {
        findUnique: jest.fn().mockResolvedValue(referral),
        update: jest.fn((args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return Promise.resolve({ ...referral, ...args.data });
        }),
      },
      // Prämie kommt aus dem Admin-Schema; hier bewusst nicht vorhanden,
      // damit die Vorgabe greift.
      $queryRaw: jest.fn().mockRejectedValue(new Error('kein admin-Schema')),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: (k: string) =>
        k === 'auth'
          ? { jwtSecret: 'x'.repeat(40) }
          : { hashingSecret: 'y'.repeat(40), verificationTokenSecret: 'z'.repeat(40) },
    };
    const service = new PartnerService(
      prisma as never,
      config as never,
      audit as never,
    );
    return { service, updates, prisma };
  };

  const ref = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    status: 'REGISTERED',
    rewardCents: 0,
    placedAt: null,
    paidAt: null,
    ...over,
  });

  it('hebt REGISTERED auf IN_PLACEMENT', async () => {
    const { service, updates } = bauen(ref());
    await service.fortschreiben('u1', 'IN_PLACEMENT');
    expect(updates[0].status).toBe('IN_PLACEMENT');
  });

  it('setzt bei PLACED Prämie und Zeitpunkt', async () => {
    const { service, updates } = bauen(ref({ status: 'IN_PLACEMENT' }));
    await service.fortschreiben('u1', 'PLACED');
    expect(updates[0].status).toBe('PLACED');
    expect(updates[0].rewardCents).toBe(10_000);
    expect(updates[0].placedAt).toBeInstanceOf(Date);
  });

  it('stuft niemals zurück', async () => {
    const { service, updates } = bauen(ref({ status: 'PLACED' }));
    await service.fortschreiben('u1', 'IN_PLACEMENT');
    expect(updates).toHaveLength(0);
  });

  it('wiederholtes PLACED ändert nichts', async () => {
    const { service, updates } = bauen(ref({ status: 'PLACED' }));
    await service.fortschreiben('u1', 'PLACED');
    expect(updates).toHaveLength(0);
  });

  it('rührt einen ausgezahlten Referral nicht an', async () => {
    const { service, updates } = bauen(
      ref({ status: 'PAID', paidAt: new Date(), rewardCents: 10_000 }),
    );
    await service.fortschreiben('u1', 'PLACED');
    expect(updates).toHaveLength(0);
  });

  it('ohne Referral passiert nichts', async () => {
    const { service, updates } = bauen(null);
    await service.fortschreiben('u1', 'PLACED');
    expect(updates).toHaveLength(0);
  });

  it('ein Fehler in der Provisionsverwaltung schlägt nicht durch', async () => {
    // Der auslösende Vorgang — eine Bewerbung — darf daran nie scheitern.
    const { service, prisma } = bauen(ref());
    prisma.referral.update.mockRejectedValueOnce(new Error('DB weg'));
    await expect(service.fortschreiben('u1', 'IN_PLACEMENT')).resolves.toBeUndefined();
  });
});
