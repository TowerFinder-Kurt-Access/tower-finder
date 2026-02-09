const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function testPassword() {
    try {
        const email = 'admin@tower-finder.com';
        const password = process.env.MASTER_PASSWORD || 'admin123';

        console.log('Testing password for:', email);
        console.log('Password:', password);

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log('❌ User not found');
            return;
        }

        console.log('\nUser found:');
        console.log('- Email:', user.email);
        console.log('- Name:', user.name);
        console.log('- Role:', user.role);
        console.log('- Active:', user.isActive);
        console.log('- Password hash:', user.password);

        const isValid = await bcrypt.compare(password, user.password);

        console.log('\n🔑 Password verification:', isValid ? '✅ VALID' : '❌ INVALID');

        if (!isValid) {
            console.log('\nℹ️  The password does not match. Recreating admin user...');
            const hashedPassword = await bcrypt.hash(password, 10);
            await prisma.user.update({
                where: { email },
                data: { password: hashedPassword }
            });
            console.log('✅ Admin password updated successfully!');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testPassword();
