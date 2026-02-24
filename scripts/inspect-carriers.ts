import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const carriers = await prisma.carrier.findMany()
    const licensees = await prisma.licensee.findMany({ include: { carrier: true } })
    const towers = await prisma.tower.findMany({
        where: { OR: [{ carrierId: { not: null } }, { licenseeId: { not: null } }] },
        select: { id: true, carrierId: true, licenseeId: true }
    })

    console.log(`Carriers: ${carriers.length}`)
    console.log(`Licensees: ${licensees.length}`)
    console.log(`Towers with either: ${towers.length}`)

    const towersWithBoth = towers.filter(t => t.carrierId !== null && t.licenseeId !== null)
    console.log(`Towers with both: ${towersWithBoth.length}`)

    let conflicts = 0
    for (const t of towersWithBoth) {
        const c = carriers.find(c => c.id === t.carrierId)
        const l = licensees.find(l => l.id === t.licenseeId)
        if (c && l && c.name.toLowerCase() !== l.name.toLowerCase()) {
            conflicts++
            if (conflicts <= 5) {
                console.log(`Conflict on Tower ${t.id}: Carrier "${c.name}" vs Licensee "${l.name}"`)
            }
        }
    }
    console.log(`Towers with conflicting Carrier and Licensee names: ${conflicts}`)

    const licenseeNames = new Set(licensees.map(l => l.name.toLowerCase()))
    const carrierNames = new Set(carriers.map(c => c.name.toLowerCase()))

    let unmappedLicensees = 0;
    for (const name of licenseeNames) {
        if (!carrierNames.has(name)) unmappedLicensees++
    }
    console.log(`Licensee names that do not exist as Carriers: ${unmappedLicensees} out of ${licenseeNames.size} unique names`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
