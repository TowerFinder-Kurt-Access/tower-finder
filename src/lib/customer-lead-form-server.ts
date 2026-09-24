import { prisma } from '@/lib/prisma';

// Server-only guard. The database enforces CustomerLeadForm.towerId -> Tower.id,
// so an unknown id surfaces as a raw P2003. Check it first and return a message
// the form can show, instead of a generic 500.
export async function towerReferenceError(towerId: number | null | undefined): Promise<string | null> {
  if (towerId == null) return null;
  const tower = await prisma.tower.findUnique({ where: { id: towerId }, select: { id: true } });
  return tower ? null : `Tower ID ${towerId} does not exist`;
}
