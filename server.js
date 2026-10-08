const cors = require('cors');
app.use(cors());
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration Constants (21 रुपये का पूरा गणित)
const ADMIN_UPI = 'Ramji91221m@okicici';
const CARD_FEE = 21;
const ADMIN_SHARE = 5;
const UPLINE_SHARE = 10;
const SERVER_SHARE = 6;

// Database Connection (MongoDB)
mongoose.connect('mongodb://localhost:27017/digital_card_mlm', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  upiId: { type: String, required: true },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  designation: { type: String, default: 'Member' },
  companyName: { type: String, default: 'Digital Business Card' },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'PENDING'], default: 'PENDING' },
  expiryDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  totalAmount: { type: Number, default: 21 },
  adminFee: { type: Number, default: 5 },
  uplineFee: { type: Number, default: 10 },
  serverFee: { type: Number, default: 6 },
  adminUpi: { type: String, default: ADMIN_UPI },
  uplineUpi: { type: String },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'PENDING' },
  type: { type: String, enum: ['REGISTRATION', 'RENEWAL'] },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Helper Functions
function generateReferralCode() {
  return 'SDC' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// API Routes - नया रजिस्ट्रेशन और पैसे का ऑटो-बंटवारा
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, upiId, referredBy, designation, companyName } = req.body;
    
    let uplineUser = null;
    if (referredBy) {
      uplineUser = await User.findOne({ referralCode: referredBy, status: 'ACTIVE' });
    }
    
    const referralCode = generateReferralCode();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 साल की वैलिडिटी

    const newUser = new User({
      name, email, phone, upiId, referralCode,
      referredBy: uplineUser ? referredBy : null,
      designation, companyName, status: 'ACTIVE', expiryDate
    });
    await newUser.save();

    // अपलाइन कमीशन के लिए टारगेट UPI (अगर अपलाइन नहीं है तो एडमिन UPI)
    const targetUplineUpi = uplineUser ? uplineUser.upiId : ADMIN_UPI;

    // Transaction Record
    const transaction = new Transaction({
      userId: newUser._id, totalAmount: CARD_FEE, adminFee: ADMIN_SHARE,
      uplineFee: UPLINE_SHARE, serverFee: SERVER_SHARE, adminUpi: ADMIN_UPI,
      uplineUpi: targetUplineUpi, status: 'SUCCESS', type: 'REGISTRATION'
    });
    await transaction.save();

    res.status(201).json({
      success: true, message: 'User registered & payment split calculated.', user: newUser,
      paymentSplit: {
        total: CARD_FEE,
        adminAllocation: { amount: ADMIN_SHARE, upi: ADMIN_UPI },
        uplineAllocation: { amount: UPLINE_SHARE, upi: targetUplineUpi },
        serverAllocation: { amount: SERVER_SHARE, purpose: 'Infrastructure' }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ऑटोमैटिक रिन्यूअल चेक (रोज रात 12 बजे चलेगा)
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily subscription check...');
  try {
    const now = new Date();
    const expiredUsers = await User.updateMany(
      { expiryDate: { $lt: now }, status: 'ACTIVE' },
      { $set: { status: 'EXPIRED' } }
    );
    console.log(`[CRON] Auto-expired ${expiredUsers.modifiedCount} users.`);
  } catch (error) {
    console.error('[CRON] Error:', error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Smart Digital Card Server running on port ${PORT}`);
});

