const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function createAdmin() {
    try {
        const password = process.env.MASTER_PASSWORD || 'admin123';
        const email = 'admin@tower-finder.com';

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create or update admin user
        const admin = await prisma.user.upsert({
            where: { email },
            update: {
                password: hashedPassword, // Update password if admin exists
                isActive: true
            },
            create: {
                email,
                name: 'System Admin',
                password: hashedPassword,
                role: 'ADMIN',
                isActive: true
            }
        });

        console.log('✅ Admin user created/updated successfully!');
        console.log('📧 Email:', admin.email);
        console.log('🔑 Password:', password);
        console.log('\nYou can now login at http://localhost:3000/login');
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
