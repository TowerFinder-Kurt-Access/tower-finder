import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const carriers = await prisma.carrier.findMany()
    const licensees = await prisma.licensee.findMany()
    const towers = await prisma.tower.findMany({
        where: { licenseeId: { not: null } },
    })

    // 1. Map Licensees to Carriers
    const licenseeToCarrierMap = new Map<number, number>()

    for (const licensee of licensees) {
        // Find matching carrier (case-insensitive)
        let matchingCarrier = carriers.find(c => c.name.toLowerCase() === licensee.name.toLowerCase())

        if (!matchingCarrier) {
            console.log(`Creating new Carrier for Licensee: "${licensee.name}"`)
            matchingCarrier = await prisma.carrier.create({
                data: { name: licensee.name }
            })
            carriers.push(matchingCarrier)
        }

        licenseeToCarrierMap.set(licensee.id, matchingCarrier.id)
    }

    console.log(`Mapped/Created Carriers for all ${licensees.length} Licensees.`)

    // 2. Update Towers
    let updatedCount = 0;
    for (const tower of towers) {
        // If tower has no carrierId, assign the mapped one
        if (tower.carrierId === null && tower.licenseeId !== null) {
            const mappedCarrierId = licenseeToCarrierMap.get(tower.licenseeId)
            if (mappedCarrierId) {
                await prisma.tower.update({
                    where: { id: tower.id },
                    data: { carrierId: mappedCarrierId }
                })
                updatedCount++
            }
        }
    }

    console.log(`Updated ${updatedCount} towers to use Carrier instead of Licensee.`)
    console.log('Data Migration complete.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
