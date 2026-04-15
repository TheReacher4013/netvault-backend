require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');
const Tenant = require('../models/Tenant.model');
const { Plan } = require('../models/index');
const logger = require('../utils/logger');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB for seeding...');

    // ── Seed Plans ──────────────────────────────────────────────────────
    await Plan.deleteMany({});
    const plans = await Plan.insertMany([
      {
        name: 'free',
        displayName: 'Free',
        price: 0,
        maxDomains: 5,
        maxClients: 3,
        maxStaff: 1,
        maxHosting: 3,
        features: ['Basic domain management', 'Email alerts', '5 domains', '3 clients'],
        isActive: true,
        trialDays: 0,
      },
      {
        name: 'starter',
        displayName: 'Starter',
        price: 999,
        maxDomains: 25,
        maxClients: 15,
        maxStaff: 3,
        maxHosting: 15,
        features: ['25 domains', '15 clients', 'SMS alerts', 'PDF invoices', 'Uptime monitoring'],
        isActive: true,
        trialDays: 14,
      },
      {
        name: 'pro',
        displayName: 'Pro',
        price: 2499,
        maxDomains: 100,
        maxClients: 50,
        maxStaff: 10,
        maxHosting: 50,
        features: ['100 domains', '50 clients', 'All alerts', 'Credential vault', 'CSV import', 'Priority support'],
        isActive: true,
        isPopular: true,
        trialDays: 14,
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        price: 4999,
        maxDomains: 99999,
        maxClients: 99999,
        maxStaff: 99999,
        maxHosting: 99999,
        features: ['Unlimited domains', 'Unlimited clients', 'White-label', 'API access', 'Dedicated support'],
        isActive: true,
        trialDays: 30,
      },
    ]);
    logger.info(`✓ Seeded ${plans.length} plans`);

    // ── Seed Super Admin ────────────────────────────────────────────────
    const existingSA = await User.findOne({ role: 'superAdmin' });
    if (!existingSA) {
      // Super admin has no tenant
      const superAdmin = await User.create({
        name: 'Super Admin',
        email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@netvault.app',
        password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
        role: 'superAdmin',
        isActive: true,
      });
      logger.info(`✓ Super Admin created: ${superAdmin.email}`);
    } else {
      logger.info('✓ Super Admin already exists, skipping.');
    }

    // ── Seed Demo Tenant + Admin ────────────────────────────────────────
    const existingDemo = await Tenant.findOne({ orgName: 'Demo Agency' });
    if (!existingDemo) {
      const demoPlan = plans.find(p => p.name === 'pro');

      const tenant = await Tenant.create({
        orgName: 'Demo Agency',
        adminId: new mongoose.Types.ObjectId(), // placeholder
        planId: demoPlan._id,
        planName: 'pro',
        maxDomains: 100,
        maxClients: 50,
        maxStaff: 10,
        email: 'demo@netvault.app',
      });

      const admin = await User.create({
        name: 'Demo Admin',
        email: 'admin@demo.com',
        password: 'Admin@123',
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });

      tenant.adminId = admin._id;
      await tenant.save();

      // Demo staff
      await User.create({
        name: 'Demo Staff',
        email: 'staff@demo.com',
        password: 'Staff@123',
        role: 'staff',
        tenantId: tenant._id,
        isActive: true,
      });

      logger.info(`✓ Demo tenant created: ${tenant.orgName}`);
      logger.info(`  Admin: admin@demo.com / Admin@123`);
      logger.info(`  Staff: staff@demo.com / Staff@123`);
    } else {
      logger.info('✓ Demo tenant already exists, skipping.');
    }

    logger.info('\n🌱 Database seeding completed successfully!');
    logger.info('─────────────────────────────────────────');
    logger.info('Super Admin: superadmin@netvault.app / SuperAdmin@123');
    logger.info('Demo Admin:  admin@demo.com / Admin@123');
    logger.info('Demo Staff:  staff@demo.com / Staff@123');
    logger.info('─────────────────────────────────────────');

    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
};

seed();
