document.getElementById('cardForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('fullName').value;
    const phone = document.getElementById('phone').value;
    const businessName = document.getElementById('businessName').value;
    const referralCode = document.getElementById('referralCode').value || 'SDC000000';

    // 1. UPI पेमेंट लिंक (₹21 का ऑटो-स्प्लिट)
    const upiID = "Ramji91221m@okicici";
    const amount = "21";
    const note = "Digital Business Card Activation";
    const upiUrl = `upi://pay?pa=${upiID}&pn=DigitalCard&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    // 2. बैकएंड सर्वर पर डेटा भेजना
    try {
        const response = await fetch('https://digital-smart-card.onrender.com/api/create-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, phone, businessName, referralCode, amountPaid: 21 })
        });

        const result = await response.json();
        if(response.ok) {
            // UPI ऐप खोलें
            window.location.href = upiUrl;
            
            // पेमेंट के बाद कार्ड पेज पर रीडायरेक्ट करें
            setTimeout(() => {
                window.location.href = `card.html?id=${result.cardId}`;
            }, 3000);
        } else {
            alert('एरर: ' + result.message);
        }
    } catch (error) {
        console.error('Server Error:', error);
        alert('सर्वर से कनेक्ट करने में समस्या आ रही है।');
    }
});

