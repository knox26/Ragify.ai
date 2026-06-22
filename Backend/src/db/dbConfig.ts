import { PrismaClient } from "@prisma/client";
// Import the driver adapter for your specific database (example uses PostgreSQL)
import { PrismaPg } from "@prisma/adapter-pg";

// Initialize the adapter according to your driver's requirements
const adapter = new PrismaPg({ connectionString: Bun.env.DATABASE_URL });

// Pass the adapter instance to PrismaClient
const prisma : PrismaClient = new PrismaClient({ adapter });
export default prisma;