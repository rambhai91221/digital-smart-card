const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const cors = require('cors');

const app = express();

// 1. मिडलवेयर सेटिंग्स
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 2. कॉन्फ़िगरेशन कांस्टेंट (Binance BEP-20 USDT Wallet, Onramp App ID एवं ₹21 कमीशन का गणित)
const BINANCE_USDT_WALLET = '0x3d4a5e5009d493968b33fa289a4094f99a989f70';
const ONRAMP_APP_ID = 2643449;
const CARD_FEE = 21;
const ADMIN_SHARE = 5;
const UPLINE_SHARE = 10;
const SERVER_SHARE = 6;

// 3. डेटाबेस कनेक्शन (MongoDB)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/digital_card_mlm';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// 4. MongoDB स्कीमा (Schemas)
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  upiId: { type: String, default: 'none' },
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
  totalAmount: { type: Number, default: CARD_FEE },
  adminFee: { type: Number, default: ADMIN_SHARE },
  uplineFee: { type: Number, default: UPLINE_SHARE },
  serverFee: { type: Number, default: SERVER_SHARE },
  walletAddress: { type: String, default: BINANCE_USDT_WALLET },
  uplineUpi: { type: String },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'PENDING' },
  type: { type: String, enum: ['REGISTRATION', 'RENEWAL'] },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// 5. यूनि‍क रेफरल कोड जनरेटर
function generateReferralCode() {
  return 'SDC' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 6. रूट राउट
app.get('/', (req, res) => {
  res.send('Smart Digital Card & Dual Payment Gateway Server is Running Live!');
});

// 7. नया कार्ड रजिस्ट्रेशन और पेमेंट स्प्लिट API (/api/create-card)
app.post('/api/create-card', async (req, res) => {
  try {
    const { fullName, email, phone, upiId, designation, businessName, referralCode: refCode } = req.body;
    
    let uplineUser = null;
    if (refCode && refCode !== 'SDC000000') {
      uplineUser = await User.findOne({ referralCode: refCode, status: 'ACTIVE' });
    }
    
    const referralCode = generateReferralCode();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const newUser = new User({
      fullName: fullName || 'User',
      email: email || 'user@example.com',
      phone: phone || '0000000000',
      upiId: upiId || 'none',
      designation: designation || 'Self',
      businessName: businessName || 'Digital Business Card',
      referralCode,
      referredBy: uplineUser ? refCode : null,
      status: 'ACTIVE',
      expiryDate
    });
    
    const savedUser = await newUser.save();

    const targetUplineUpi = uplineUser ? uplineUser.upiId : 'Admin Pool';

    const transaction = new Transaction({
      userId: savedUser._id, 
      totalAmount: CARD_FEE,
      adminFee: ADMIN_SHARE,
      uplineFee: UPLINE_SHARE,
      serverFee: SERVER_SHARE,
      walletAddress: BINANCE_USDT_WALLET,
      uplineUpi: targetUplineUpi,
      status: 'PENDING', 
      type: 'REGISTRATION'
    });
    await transaction.save();

    res.status(201).json({
      success: true, 
      cardId: savedUser._id,
      message: 'User registered & payment split logged.', 
      user: savedUser,
      cryptoGateway: {
        appId: ONRAMP_APP_ID,
        walletAddress: BINANCE_USDT_WALLET,
        network: "bsc",
        coinCode: "USDT"
      },
      paymentSplit: {
        total: CARD_FEE,
        adminAllocation: { amount: ADMIN_SHARE, purpose: 'Admin Profit' },
        uplineAllocation: { amount: UPLINE_SHARE, upi: targetUplineUpi },
        serverAllocation: { amount: SERVER_SHARE, purpose: 'Infrastructure' }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. कार्ड निकालने का राउट (/api/get-card/:id)
app.get('/api/get-card/:id', async (req, res) => {
    try {
        const card = await User.findById(req.params.id);
        if(!card) return res.status(404).json({ success: false, message: 'Card not found' });
        res.json({ success: true, card });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 9. ऑटो-एक्सपायरी क्रॉन जॉब (रोज रात 12 बजे)
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Daily subscription check running...');
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

// 10. पोर्ट लिसनर
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Smart Digital Card Server running on port ${PORT}`);
});
