const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BINANCE_USDT_WALLET = '0x3d4a5e5009d493968b33fa289a4094f99a989f70';
const ONRAMP_APP_ID = 2643449;
const CARD_FEE = 21;
const ADMIN_SHARE = 5;
const UPLINE_SHARE = 10;
const SERVER_SHARE = 6;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/digital_card_mlm';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// यूजर स्कीमा (वॉलेट बैलेंस और कमाई के साथ)
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  upiId: { type: String, default: 'none' },
  designation: { type: String, default: 'Self' },
  businessName: { type: String, default: 'Digital Business Card' },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  walletBalance: { type: Number, default: 0 }, // वर्तमान उपलब्ध बैलेंस
  totalEarnings: { type: Number, default: 0 }, // कुल लाइफटाइम कमाई
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
  uplineId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['SUCCESS', 'PENDING'], default: 'PENDING' },
  timestamp: { type: Date, default: Date.now }
});

const withdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  upiId: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'PAID'], default: 'PENDING' },
  requestDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

function generateReferralCode() {
  return 'SDC' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/', (req, res) => {
  res.send('Smart Digital Card Auto-Split & Wallet Server Running Live!');
});

// कार्ड रजिस्ट्रेशन और ऑटो-कमीशन क्रेडिट API
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

    // अगर अपलाइन है, तो उसका ₹10 ऑटोमैटिक उसके वॉलेट में जोड़ें
    if (uplineUser) {
      uplineUser.walletBalance += UPLINE_SHARE;
      uplineUser.totalEarnings += UPLINE_SHARE;
      await uplineUser.save();
    }

    const transaction = new Transaction({
      userId: savedUser._id, 
      totalAmount: CARD_FEE,
      adminFee: ADMIN_SHARE,
      uplineFee: UPLINE_SHARE,
      serverFee: SERVER_SHARE,
      walletAddress: BINANCE_USDT_WALLET,
      uplineId: uplineUser ? uplineUser._id : null,
      status: 'PENDING'
    });
    await transaction.save();

    res.status(201).json({
      success: true, 
      cardId: savedUser._id,
      message: 'User registered & commission credited to upline wallet.',
      paymentSplit: {
        total: CARD_FEE,
        adminAllocation: { amount: ADMIN_SHARE },
        uplineAllocation: { amount: UPLINE_SHARE, uplineName: uplineUser ? uplineUser.fullName : 'Admin Pool' },
        serverAllocation: { amount: SERVER_SHARE }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// यूजर का डैशबोर्ड डेटा प्राप्त करने के लिए API
app.get('/api/user-dashboard/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if(!user) return res.status(404).json({ success: false, message: 'User not found' });

    // इस यूजर के द्वारा डायरेक्ट किए गए रेफरल की लिस्ट
    const referrals = await User.find({ referredBy: user.referralCode }).select('fullName email phone createdAt status');

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        upiId: user.upiId,
        referralCode: user.referralCode,
        walletBalance: user.walletBalance,
        totalEarnings: user.totalEarnings
      },
      referrals
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// विड्रॉल रिक्वेस्ट API (यूजर अपने बैलेंस को निकालने के लिए अनुरोध भेजेगा)
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.walletBalance < amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'पर्याप्त बैलेंस नहीं है (Insufficient Balance)' });
    }

    // बैलेंस काट लें और विड्रॉल रिक्वेस्ट बनाएं
    user.walletBalance -= amount;
    await user.save();

    const withdrawal = new Withdrawal({
      userId: user._id,
      amount,
      upiId: user.upiId,
      status: 'PENDING'
    });
    await withdrawal.save();

    res.json({ success: true, message: 'विड्रॉल रिक्वेस्ट सफलतापूर्वक दर्ज हो गई है!', newBalance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Smart Digital Card Wallet Server running on port ${PORT}`);
});
