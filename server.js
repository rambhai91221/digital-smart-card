const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration Constants (21 रुपये का पूरा गणित और स्प्लिट)
const ADMIN_UPI = 'Ramji91221m@okicici';
const CARD_FEE = 21;
const ADMIN_SHARE = 5;
const UPLINE_SHARE = 10;
const SERVER_SHARE = 6;

// Database Connection (MongoDB)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/digital_card_mlm';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  upiId: { type: String, required: true },
  designation: { type: String, default: 'Self' },
  businessName: { type: String, default: 'Digital Business Card' },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'PENDING'], default: 'ACTIVE' },
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
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'SUCCESS' },
  type: { type: String, enum: ['REGISTRATION', 'RENEWAL'] },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Helper Functions
function generateReferralCode() {
  return 'SDC' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Root Route
app.get('/', (req, res) => {
  res.send('Smart Digital Card Server is Running Live!');
});

// 1. नया कार्ड रजिस्ट्रेशन और पेमेंट ऑटो-स्प्लिट राउट (/api/create-card)
app.post('/api/create-card', async (req, res) => {
  try {
    const { fullName, email, phone, upiId, designation, businessName, referralCode: refCode } = req.body;
    
    let uplineUser = null;
    if (refCode && refCode !== 'SDC000000') {
      uplineUser = await User.findOne({ referralCode: refCode, status: 'ACTIVE' });
    }
    
    const referralCode = generateReferralCode();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 साल की वैलिडिटी

    const newUser = new User({
      fullName: fullName || 'User',
      email: email || 'user@example.com',
      phone: phone || '0000000000',
      upiId: upiId || ADMIN_UPI,
      designation: designation || 'Self',
      businessName: businessName || 'Digital Business Card',
      referralCode,
      referredBy: uplineUser ? refCode : null,
      status: 'ACTIVE',
      expiryDate
    });
    
    const savedUser = await newUser.save();

    // अपलाइन कमीशन के लिए टारगेट UPI (अगर अपलाइन नहीं है तो एडमिन UPI)
    const targetUplineUpi = uplineUser ? uplineUser.upiId : ADMIN_UPI;

    // Transaction Record
    const transaction = new Transaction({
      userId: savedUser._id, 
      totalAmount: CARD_FEE, 
      adminFee: ADMIN_SHARE,
      uplineFee: UPLINE_SHARE, 
      serverFee: SERVER_SHARE, 
      adminUpi: ADMIN_UPI,
      uplineUpi: targetUplineUpi, 
      status: 'SUCCESS', 
      type: 'REGISTRATION'
    });
    await transaction.save();

    res.status(201).json({
      success: true, 
      cardId: savedUser._id,
      message: 'User registered & payment split calculated successfully.', 
      user: savedUser,
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

// 2. आईडी से कार्ड डेटा निकालने का राउट (/api/get-card/:id)
app.get('/api/get-card/:id', async (req, res) => {
    try {
        const card = await User.findById(req.params.id);
        if(!card) return res.status(404).json({ success: false, message: 'Card not found' });
        res.json({ success: true, card });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Smart Digital Card Server running on port ${PORT}`);
});
