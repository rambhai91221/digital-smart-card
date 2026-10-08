document.getElementById('cardForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const upiId = document.getElementById('upiId').value;
    const designation = document.getElementById('designation').value;
    const businessName = document.getElementById('businessName').value;
    const referralCode = document.getElementById('referralCode').value || 'SDC000000';

    // UPI पेमेंट डिटेल्स (₹21)
    const adminUpi = "Ramji91221m@okicici";
    const amount = "21";
    const note = "Digital Business Card Activation";
    const upiUrl = `upi://pay?pa=${adminUpi}&pn=DigitalCard&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    // 1. तुरंत UPI पेमेंट ऐप (Google Pay, PhonePe, Paytm) खोलें
    window.location.href = upiUrl;

    // 2. इसके बाद बैकएंड सर्वर पर डेटा सेव करें और स्क्रीन पर कार्ड लिंक दिखाएं
    try {
        const response = await fetch('https://digital-smart-card.onrender.com/api/create-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName,
                email,
                phone,
                upiId,
                designation,
                businessName,
                referralCode,
                amountPaid: 21
            })
        });

        const result = await response.json();
        if(response.ok) {
            let resultBox = document.getElementById('resultBox');
            if(!resultBox) {
                resultBox = document.createElement('div');
                resultBox.id = 'resultBox';
                resultBox.style.marginTop = '20px';
                resultBox.style.padding = '20px';
                resultBox.style.background = '#f0fdf4';
                resultBox.style.border = '2px solid #22c55e';
                resultBox.style.borderRadius = '12px';
                resultBox.style.textAlign = 'center';
                document.querySelector('form').appendChild(resultBox);
            }

            const cardLink = `https://rambhai91221.github.io/digital-smart-card/card.html?id=${result.cardId}`;
            
            resultBox.innerHTML = `
                <h3 style="color: #15803d; margin-top: 0;">🎉 कार्ड रजिस्टर हो गया!</h3>
                <p style="font-size: 14px; color: #334155;">अगर पेमेंट ऐप अपने आप नहीं खुला, तो नीचे दिए गए बटन पर क्लिक करें:</p>
                <a href="${upiUrl}" style="display: block; background: #16a34a; color: white; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-bottom: 12px;">📱 यहाँ क्लिक करके ₹21 Pay करें</a>
                <p style="font-size: 14px; color: #334155; margin-top: 15px;">আপনার डिजिटल कार्ड लिंक:</p>
                <input type="text" value="${cardLink}" readonly style="width: 100%; padding: 10px; margin: 5px 0 10px 0; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; background: #fff;">
                <a href="${cardLink}" target="_blank" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">डिजिटल कार्ड देखें 👀</a>
            `;
        } else {
            alert('एरर: ' + (result.message || 'डेटा सेव नहीं हुआ'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('सर्वर से कनेक्ट करने में समस्या आ रही है।');
    }
});
