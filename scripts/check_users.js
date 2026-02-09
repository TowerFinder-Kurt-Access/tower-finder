const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkUsers() {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                password: true // To check if it's hashed
            }
        });

        console.log('Users in database:');
        console.log(JSON.stringify(users, null, 2));

        if (users.length === 0) {
            console.log('\n⚠️  No users found in database!');
            console.log('Run: node scripts/create_admin.js');
        }
    } catch (error) {
        console.error('Error checking users:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
