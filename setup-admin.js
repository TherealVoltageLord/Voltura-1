const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    isAdmin: Boolean,
    adminRole: String
});

const User = mongoose.model('User', userSchema);

async function setupAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const existingAdmin = await User.findOne({ username: 'Voltage' });
        
        if (existingAdmin) {
            console.log('Admin already exists. Updating password...');
            const hashedPassword = await bcrypt.hash('Voltage6#', 12);
            existingAdmin.password = hashedPassword;
            existingAdmin.isAdmin = true;
            existingAdmin.adminRole = 'super_admin';
            await existingAdmin.save();
            console.log('Admin updated successfully!');
        } else {
            const hashedPassword = await bcrypt.hash('Voltage6#', 12);
            const adminUser = new User({
                username: 'Voltage',
                email: 'admin@voltura.com',
                password: hashedPassword,
                isAdmin: true,
                adminRole: 'super_admin'
            });
            
            await adminUser.save();
            console.log('Default admin created successfully!');
            console.log('Username: Voltage');
            console.log('Password: Voltage6#');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error setting up admin:', error);
        process.exit(1);
    }
}

setupAdmin();
