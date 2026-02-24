import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const carriers = await prisma.carrier.findMany({
        include: {
            _count: {
                select: { towers: true }
            }
        }
    });

    console.log(`Total carriers: ${carriers.length}`);

    const nameMap = new Map<string, typeof carriers>();

    for (const c of carriers) {
        const normalized = c.name.trim().toLowerCase();
        if (!nameMap.has(normalized)) {
            nameMap.set(normalized, []);
        }
        nameMap.get(normalized)!.push(c);
    }

    let exactDuplicates = 0;
    let caseInsensitiveDuplicates = 0;

    for (const [name, list] of nameMap.entries()) {
        if (list.length > 1) {
            console.log(`Duplicate found for "${name}":`);
            for (const c of list) {
                console.log(`  ID: ${c.id}, Name: "${c.name}", Towers: ${c._count.towers}`);
            }
            caseInsensitiveDuplicates++;
        }
    }

    console.log(`Groups of duplicates: ${caseInsensitiveDuplicates}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
